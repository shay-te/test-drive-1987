import { CRASH, FALL } from '../config.js';
import { TRAFFIC_TYPES } from '../data/traffic.js';
import { rotate } from '../util/quaternion.js';
import { add, cross, dot, normalize, scale, sub, vec } from '../util/vector.js';
import { groundNormal } from './Landscape.js';
import { airLost, playerBody, trafficBody, underwater } from './wreckBodies.js';

const UP = vec(0, 1, 0);

/** A crash on the road played out: the player's car and the car it hit (or the rock face or rail it
 *  hit) as rigid bodies thrown apart by the impact, tumbling over the ground until they settle. */
export class RoadCrash {
    /** `other` is the traffic vehicle hit, or null for the rock face or a rail. */
    constructor(vehicle, track, landscape, other = null) {
        this.ground = rockFaceRamp(track, landscape);
        const player = playerBody(vehicle, track);
        this.body = player.body;
        this.centre = player.centre;
        this.other = other;
        if (other) {
            const hit = trafficBody(other, track, TRAFFIC_TYPES[other.type]);
            this.otherBody = hit.body;
            this.otherCentre = hit.centre;
            collide(this.body, this.otherBody, vehicle.car.body.length, other.length);
            // The driver hit stamps on the brakes: its wheels lock.
            this.otherBody.rollingShare = 1;
        } else {
            this.otherBody = null;
            bounce(this.body, track, vehicle);
        }
        this.bodies = [this.body, this.otherBody].filter(Boolean);
        this.still = 0;
        this.time = 0;
        this.accumulator = 0;
        this.hardestHit = 0;
    }

    /** Runs the crash for `dt` seconds; returns the hardest hits (m/s) each car took in that time, and
     *  like a fall over the edge, the speed the player's car hit the water at and the air it let out. */
    update(dt) {
        const hits = { player: 0, other: 0, splash: 0, air: 0 };
        const flooded = this.body.flooded;
        this.accumulator += dt;
        while (this.accumulator >= FALL.substep && !this.done) {
            this.accumulator -= FALL.substep;
            for (const body of this.bodies) body.step(FALL.substep, this.ground);
            this.time += FALL.substep;
            if (this.body.impact > FALL.hitSpeed) hits.player = Math.max(hits.player, this.body.impact);
            if (this.otherBody?.impact > FALL.hitSpeed) hits.other = Math.max(hits.other, this.otherBody.impact);
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

    /** The other car's model origin (centred, on the ground) and turn, or null. */
    get otherPose() {
        return this.otherBody ? poseOf(this.otherBody, this.otherCentre) : null;
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
