import { PHYS } from '../config.js';
import { conjugate, integrate, rotate } from '../util/quaternion.js';
import { add, cross, dot, length, normalize, scale, sub, vec } from '../util/vector.js';

/** A rigid body tumbling over the ground: gravity, air drag, crushing contacts with friction at sample
 *  points on its hull, and the sea it may float in, fill with and sink through. Vectors are plain
 *  {x, y, z}; orientation is a unit quaternion. */
export class RigidBody {
    /** `spec` = {mass, inertia {x, y, z} (principal, body frame), points [{x, y, z, rolling}] (body
     *  frame, from the centre of mass), volume (bounding box, m3), dragArea, contact {stiffness,
     *  damping, friction, grip, rolling}, water (WATER)}. */
    constructor(spec, { position, velocity, orientation, angularVelocity }) {
        Object.assign(this, spec);
        this.position = position;
        this.velocity = velocity;
        this.orientation = orientation;
        this.angularVelocity = angularVelocity;
        this.impact = 0;
        this.penetration = 0;
        this.rollingShare = spec.contact.rolling;
        this.wet = 0;
        this.flooded = 0;
        this.splash = 0;
        // The box round its hull points (body frame), what another body or a trunk can hit.
        this.box = {
            min: vec(...['x', 'y', 'z'].map((k) => { return Math.min(...spec.points.map((p) => { return p[k]; })); })),
            max: vec(...['x', 'y', 'z'].map((k) => { return Math.max(...spec.points.map((p) => { return p[k]; })); })),
        };
    }

    /** Gives the body `impulse` (N s, world) at `r` (world, from its centre of mass). */
    push(r, impulse) {
        this.velocity = add(this.velocity, scale(impulse, 1 / this.mass));
        const q = this.orientation;
        const t = rotate(conjugate(q), cross(r, impulse));
        const I = this.inertia;
        this.angularVelocity = add(this.angularVelocity, rotate(q, vec(t.x / I.x, t.y / I.y, t.z / I.z)));
    }

    /** World point `p` in the body's frame (from its centre of mass). */
    local(p) {
        return rotate(conjugate(this.orientation), sub(p, this.position));
    }

    get speed() {
        return length(this.velocity);
    }

    get spin() {
        return length(this.angularVelocity);
    }

    /** Advances by `dt` over `ground` = {heightAt(x, z), normalAt(x, z), waterLevel?, frictionAt(x, z, n)?
     *  (the sliding friction there, else the contact's own)}. Afterwards `impact`
     *  holds the hardest closing speed of any contact (m/s), `penetration` the deepest crush (m), `wet`
     *  the share of the hull under water, and `splash` the speed it went in at on the step it did. */
    step(dt, ground) {
        const q = this.orientation;
        const drag = -0.5 * PHYS.airDensity * this.dragArea * this.speed;
        let force = add(vec(0, -this.mass * PHYS.g, 0), scale(this.velocity, drag));
        let torque = vec();
        const forward = rotate(q, vec(0, 0, -1));
        const sea = ground.waterLevel ?? -Infinity;
        let wet = 0;
        this.impact = 0;
        this.penetration = 0;
        for (const point of this.points) {
            const r = rotate(q, point);
            const p = add(this.position, r);
            const v = add(this.velocity, cross(this.angularVelocity, r));
            let f = vec();
            if (p.y < sea) {
                const under = Math.min(1, (sea - p.y) / this.water.surface);
                wet += under / this.points.length;
                f = this._water(v, under, dt);
            }
            const depth = ground.heightAt(p.x, p.z) - p.y;
            if (depth > 0) {
                const n = ground.normalAt(p.x, p.z);
                const vn = dot(v, n);
                const crush = depth * n.y;
                const fn = Math.max(0, this.contact.stiffness * crush - this.contact.damping * vn);
                this.impact = Math.max(this.impact, -vn);
                this.penetration = Math.max(this.penetration, crush);
                const mu = ground.frictionAt?.(p.x, p.z, n) ?? this.contact.friction;
                f = add(f, add(scale(n, fn), this._friction(sub(v, scale(n, vn)), n, fn, mu, point.rolling, forward, dt)));
            }
            force = add(force, f);
            torque = add(torque, cross(r, f));
        }
        this.splash = wet > 0 && this.wet === 0 ? this.speed : 0;
        this.wet = wet;
        if (wet > 0) this.flooded = Math.min(1, this.flooded + dt / this.water.floodSeconds);
        this.velocity = add(this.velocity, scale(force, dt / this.mass));
        this.position = add(this.position, scale(this.velocity, dt));
        // Euler's equations in the body frame, where the inertia is diagonal.
        const inverse = conjugate(q);
        const w = rotate(inverse, this.angularVelocity);
        const t = rotate(inverse, torque);
        const I = this.inertia;
        const gyro = cross(w, vec(I.x * w.x, I.y * w.y, I.z * w.z));
        const alpha = vec((t.x - gyro.x) / I.x, (t.y - gyro.y) / I.y, (t.z - gyro.z) / I.z);
        this.angularVelocity = rotate(q, add(w, scale(alpha, dt)));
        // Explicit steps can feed a fast tumble energy it never had; no real wreck spins this fast.
        const spin = length(this.angularVelocity);
        if (spin > this.contact.maxSpin) this.angularVelocity = scale(this.angularVelocity, this.contact.maxSpin / spin);
        this.orientation = integrate(q, this.angularVelocity, dt);
    }

    /** What the sea does at one hull point `under` (0..1) the surface moving at `v`: it holds up its share
     *  of the air still inside and of the steel, and drags, never hard enough to turn the point back. */
    _water(v, under, dt) {
        const w = this.water;
        const share = under / this.points.length;
        const displaced = this.volume * w.airShare * (1 - this.flooded) + this.mass / w.steel;
        const lift = vec(0, displaced * share * w.density * PHYS.g, 0);
        const speed = length(v);
        if (speed < 1e-6) return lift;
        const pull = Math.min(0.5 * w.density * w.dragArea * share * speed * speed, (this.mass * share * speed) / dt);
        return add(lift, scale(v, -pull / speed));
    }

    /** Coulomb friction against sliding velocity `vt`; a rolling point resists only `rollingShare` of
     *  it along the body's length. `grip` makes small slips stick instead of chattering, but no contact
     *  may push back harder in a step `dt` than stopping its share of the body would take. */
    _friction(vt, n, fn, mu, rolling, forward, dt) {
        const c = this.contact;
        const stop = (this.mass * c.stickShare) / dt;
        const oppose = (slip, mu) => {
            const speed = length(slip);
            if (speed < 1e-6) return vec();
            return scale(slip, -Math.min(mu * fn, c.grip * speed, stop * speed) / speed);
        };
        if (!rolling) return oppose(vt, mu);
        const along = normalize(sub(forward, scale(n, dot(forward, n))));
        const roll = scale(along, dot(vt, along));
        return add(oppose(roll, mu * this.rollingShare), oppose(sub(vt, roll), mu));
    }
}
