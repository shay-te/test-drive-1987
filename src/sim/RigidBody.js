import { PHYS } from '../config.js';
import { conjugate, integrate, rotate } from '../util/quaternion.js';
import { add, cross, dot, length, normalize, scale, sub, vec } from '../util/vector.js';

/** A rigid body tumbling over the ground: gravity, air drag, and crushing contacts with friction at
 *  sample points on its hull. Vectors are plain {x, y, z}; orientation is a unit quaternion. */
export class RigidBody {
    /** `spec` = {mass, inertia {x, y, z} (principal, body frame), points [{x, y, z, rolling}] (body
     *  frame, from the centre of mass), dragArea, contact {stiffness, damping, friction, grip, rolling}}. */
    constructor(spec, { position, velocity, orientation, angularVelocity }) {
        Object.assign(this, spec);
        this.position = position;
        this.velocity = velocity;
        this.orientation = orientation;
        this.angularVelocity = angularVelocity;
        this.impact = 0;
        this.penetration = 0;
        this.rollingShare = spec.contact.rolling;
    }

    get speed() {
        return length(this.velocity);
    }

    get spin() {
        return length(this.angularVelocity);
    }

    /** Advances by `dt` over `ground` = {heightAt(x, z), normalAt(x, z)}. Afterwards `impact` holds the
     *  hardest closing speed of any contact (m/s) and `penetration` the deepest crush (m). */
    step(dt, ground) {
        const q = this.orientation;
        const drag = -0.5 * PHYS.airDensity * this.dragArea * this.speed;
        let force = add(vec(0, -this.mass * PHYS.g, 0), scale(this.velocity, drag));
        let torque = vec();
        const forward = rotate(q, vec(0, 0, -1));
        this.impact = 0;
        this.penetration = 0;
        for (const point of this.points) {
            const r = rotate(q, point);
            const p = add(this.position, r);
            const depth = ground.heightAt(p.x, p.z) - p.y;
            if (depth <= 0) continue;
            const n = ground.normalAt(p.x, p.z);
            const v = add(this.velocity, cross(this.angularVelocity, r));
            const vn = dot(v, n);
            const crush = depth * n.y;
            const fn = Math.max(0, this.contact.stiffness * crush - this.contact.damping * vn);
            this.impact = Math.max(this.impact, -vn);
            this.penetration = Math.max(this.penetration, crush);
            const f = add(scale(n, fn), this._friction(sub(v, scale(n, vn)), n, fn, point.rolling, forward, dt));
            force = add(force, f);
            torque = add(torque, cross(r, f));
        }
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

    /** Coulomb friction against sliding velocity `vt`; a rolling point resists only `rollingShare` of
     *  it along the body's length. `grip` makes small slips stick instead of chattering, but no contact
     *  may push back harder in a step `dt` than stopping its share of the body would take. */
    _friction(vt, n, fn, rolling, forward, dt) {
        const c = this.contact;
        const stop = (this.mass * c.stickShare) / dt;
        const oppose = (slip, mu) => {
            const speed = length(slip);
            if (speed < 1e-6) return vec();
            return scale(slip, -Math.min(mu * fn, c.grip * speed, stop * speed) / speed);
        };
        if (!rolling) return oppose(vt, c.friction);
        const along = normalize(sub(forward, scale(n, dot(forward, n))));
        const roll = scale(along, dot(vt, along));
        return add(oppose(roll, c.friction * this.rollingShare), oppose(sub(vt, roll), c.friction));
    }
}
