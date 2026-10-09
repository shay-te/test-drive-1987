import { CRASH, FALL } from '../config.js';
import { TRAFFIC_TYPES } from '../data/traffic.js';
import { rotate } from '../util/quaternion.js';
import { add, cross, dot, normalize, scale, sub, vec } from '../util/vector.js';
import { groundNormal } from './Landscape.js';
import { airLost, playerBody, trafficBody, underwater } from './wreckBodies.js';
import { bodyContacts, overlaps, trunkContacts } from './wreckContacts.js';

const UP = vec(0, 1, 0);
/** Traffic further than this (m) from every car of the wreck cannot be touching it. */
const GATHER_REACH = 12;

/** A crash on the road played out: the player's car and the car it hit (or the rock face or rail it
 *  hit) as rigid bodies thrown apart by the impact, tumbling over the ground until they settle,
 *  stopped by the trees' trunks and by each other; traffic still driving into the wreck joins it,
 *  thrown apart in turn, so one crash can set off the next. */
export class RoadCrash {
    /** `other` is the traffic vehicle hit, or null for the rock face or a rail; `trunks` (TreeTrunks)
     *  and `traffic` (TrafficManager) are what else on the road the wreck can hit. */
    constructor(vehicle, track, landscape, other = null, { trunks = null, traffic = null } = {}) {
        this.track = track;
        this.ground = rockFaceRamp(track, landscape);
        this.trunks = trunks;
        this.traffic = traffic;
        const player = playerBody(vehicle, track);
        this.body = player.body;
        this.centre = player.centre;
        this.bodies = [this.body];
        this.lengths = new Map([[this.body, vehicle.car.body.length]]);
        // Every traffic vehicle in the wreck ({ vehicle, body, centre }), the car hit first.
        this.joined = [];
        // Bodies thrown apart by an impact press on each other again only once they have parted.
        this.touching = new Set();
        if (other) this._join(other, trafficBody(other, track, TRAFFIC_TYPES[other.type]), this.body);
        else bounce(this.body, track, vehicle);
        this.still = 0;
        this.time = 0;
        this.accumulator = 0;
        this.hardestHit = 0;
    }

    /** Traffic `vehicle` (as `hit`, its body and centre) joins the wreck, thrown apart from wreck body
     *  `by`; its driver stamps on the brakes, its wheels lock, and it leaves the traffic. */
    _join(vehicle, hit, by) {
        collide(by, hit.body, this.lengths.get(by), vehicle.length);
        hit.body.rollingShare = 1;
        Object.assign(vehicle, { scripted: true, wrecked: true });
        this.joined.push({ vehicle, ...hit });
        this.bodies.push(hit.body);
        this.lengths.set(hit.body, vehicle.length);
        this.touching.add(`${this.bodies.indexOf(by)},${this.bodies.length - 1}`);
    }

    /** Traffic that has driven into a car of the wreck joins it. */
    _gather() {
        for (const vehicle of this.traffic?.vehicles ?? []) {
            if (vehicle.wrecked) continue;
            const at = this.track.toWorld(vehicle.s, vehicle.u, 0);
            const near = this.bodies.filter((body) => {
                return Math.hypot(body.position.x - at.x, body.position.z - at.z) < GATHER_REACH;
            });
            if (!near.length) continue;
            const hit = trafficBody(vehicle, this.track, TRAFFIC_TYPES[vehicle.type]);
            const by = near.find((body) => { return overlaps(body, hit.body); });
            if (by) this._join(vehicle, hit, by);
        }
    }

    /** The trunks and the other cars push back on every car of the wreck. */
    _contacts(dt) {
        for (const body of this.bodies) if (this.trunks) trunkContacts(body, this.trunks, dt);
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const [a, b] = [this.bodies[i], this.bodies[j]];
                const pair = `${i},${j}`;
                if (this.touching.has(pair)) {
                    if (!overlaps(a, b)) this.touching.delete(pair);
                    continue;
                }
                bodyContacts(a, b, dt);
            }
        }
    }

    /** Runs the crash for `dt` seconds; returns the hardest hits (m/s) each car took in that time, and
     *  like a fall over the edge, the speed the player's car hit the water at and the air it let out. */
    update(dt) {
        const hits = { player: 0, other: 0, splash: 0, air: 0 };
        const flooded = this.body.flooded;
        this._gather();
        this.accumulator += dt;
        while (this.accumulator >= FALL.substep && !this.done) {
            this.accumulator -= FALL.substep;
            for (const body of this.bodies) body.step(FALL.substep, this.ground);
            this._contacts(FALL.substep);
            this.time += FALL.substep;
            if (this.body.impact > FALL.hitSpeed) hits.player = Math.max(hits.player, this.body.impact);
            for (const { body } of this.joined) if (body.impact > FALL.hitSpeed) hits.other = Math.max(hits.other, body.impact);
            hits.splash = Math.max(hits.splash, this.body.splash);
            const resting = this.bodies.every((body) => { return body.speed < FALL.restSpeed && body.spin < FALL.restSpin; });
            this.still = resting ? this.still + FALL.substep : 0;
        }
        this.hardestHit = Math.max(this.hardestHit, hits.player);
        hits.air = airLost(this.body, flooded);
        for (const body of this.bodies) if (body.impact > FALL.wreckSpeed) body.rollingShare = 1;
        return hits;
    }

    get done() {
        return this.still >= FALL.restSeconds || this.time >= CRASH.maxSeconds;
    }

    /** The player's car is under the sea's surface, deep enough to watch from beneath it. */
    get underwater() {
        return underwater(this.body, this.ground.waterLevel);
    }

    /** The player's car-space origin and turn: the cabin and the camera ride on it. */
    get pose() {
        return poseOf(this.body, this.centre);
    }

    /** The model origin (centred, on the ground) and turn of the first car hit, or null. */
    get otherPose() {
        return this.joined.length ? poseOf(this.joined[0].body, this.joined[0].centre) : null;
    }

    /** Every traffic vehicle in the wreck with the pose its model is drawn at. */
    get wrecked() {
        return this.joined.map(({ vehicle, body, centre }) => { return { vehicle, pose: poseOf(body, centre) }; });
    }
}

function poseOf(body, centre) {
    const q = body.orientation;
    return { position: sub(body.position, rotate(q, centre)), quaternion: q };
}

/** The two cars spring apart along the line between them, sharing the momentum by mass; the harder
 *  the hit, the more they ride up over each other (the lighter most) and spin, off-centre hits about
 *  the vertical, the riding car nose-up. */
function collide(a, b, lengthA, lengthB) {
    const between = sub(b.position, a.position);
    const n = normalize(vec(between.x, 0, between.z));
    const closing = Math.max(0, dot(sub(a.velocity, b.velocity), n));
    const total = a.mass + b.mass;
    const impulse = ((1 + CRASH.restitution) * closing * a.mass * b.mass) / total;
    a.velocity = add(a.velocity, scale(n, -impulse / a.mass));
    b.velocity = add(b.velocity, scale(n, impulse / b.mass));
    a.velocity.y += CRASH.rideUp * closing * (b.mass / total);
    b.velocity.y += CRASH.rideUp * closing * (a.mass / total);
    const side = cross(n, UP);
    const offset = dot(between, side);
    // A point at the front (+n) of `a` rises when it turns about n x up; `b` faces the other way.
    a.angularVelocity = add(a.angularVelocity, add(
        scale(UP, (-CRASH.yawSpin * closing * offset) / lengthA),
        scale(side, CRASH.pitchSpin * closing * (b.mass / total)),
    ));
    b.angularVelocity = add(b.angularVelocity, add(
        scale(UP, (CRASH.yawSpin * closing * offset) / lengthB),
        scale(side, -CRASH.pitchSpin * closing * (a.mass / total)),
    ));
}

/** Off the rock face or a rail: the sideways speed turns back, much reduced, and the car spins away. */
function bounce(body, track, vehicle) {
    const p = track.toWorld(vehicle.s, 0, 0);
    const q = track.toWorld(vehicle.s, 1, 0);
    const across = normalize(vec(q.x - p.x, 0, q.z - p.z));
    const sideways = dot(body.velocity, across);
    body.velocity = add(body.velocity, scale(across, -(1 + CRASH.wallBounce) * sideways));
    body.angularVelocity = add(body.angularVelocity, scale(UP, (CRASH.yawSpin * sideways) / vehicle.car.body.length));
}

/** The landscape as a crashing car meets it: the rock face is a steep ramp it is pushed back off,
 *  not the sheer step it would be flung up out of; past the edge it is the real drop. */
function rockFaceRamp(track, landscape) {
    const ground = {
        hint: 0,
        waterLevel: landscape.waterLevel,
        heightAt(x, z) {
            const p = track.project(x, z, ground.hint);
            ground.hint = p.i;
            const face = track.wallOffsetAt(p.s) + CRASH.wallGap;
            if (p.u > face) return track.elevationAt(p.s) + CRASH.wallSlope * (p.u - face);
            return landscape.heightAt(x, z);
        },
        normalAt(x, z) {
            return groundNormal(ground, x, z);
        },
    };
    return ground;
}
