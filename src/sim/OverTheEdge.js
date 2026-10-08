import { FALL } from '../config.js';
import { fromEulerYXZ, rotate } from '../util/quaternion.js';
import { add, scale, sub, vec } from '../util/vector.js';
import { RigidBody } from './RigidBody.js';

/** A car gone over the edge: a rigid body launched with the car's last motion, tumbling down the drop
 *  and the valley side until it stops, keeping the numbers of the fall. */
export class OverTheEdge {
    constructor(vehicle, track, landscape) {
        const b = vehicle.car.body;
        const c = vehicle.car.chassis;
        this.landscape = landscape;
        // Car space as the cabin uses it: x right, y up from the road, z back, origin under the eye.
        this.centre = vec(0, c.cgHeight, b.wheels[0].x + vehicle.a - b.eye);
        const yaw = track.headingAt(vehicle.s) + vehicle.theta;
        const orientation = fromEulerYXZ(Math.atan(track.gradeAt(vehicle.s)), -yaw, 0);
        const ground = track.toWorld(vehicle.s, vehicle.u, 0);
        const origin = vec(ground.x, ground.y, ground.z);
        const forward = rotate(orientation, vec(0, 0, -1));
        const right = rotate(orientation, vec(1, 0, 0));
        this.body = new RigidBody(
            {
                mass: c.massKg,
                inertia: boxInertia(c.massKg, b.width, b.height, b.length),
                points: hull(b, this.centre),
                dragArea: FALL.dragArea,
                contact: FALL,
            },
            {
                position: add(origin, rotate(orientation, this.centre)),
                velocity: add(scale(forward, vehicle.vx), scale(right, vehicle.vy)),
                orientation,
                angularVelocity: rotate(orientation, vec(0, -vehicle.yawRate, 0)),
            },
        );
        this.startHeight = origin.y;
        this.time = 0;
        this.still = 0;
        this.topSpeed = this.body.speed;
        this.hardestHit = 0;
        this.deepestCrush = 0;
        this.accumulator = 0;
    }

    /** Runs the fall for `dt` seconds; returns the hardest hit (m/s) in that time, 0 if none. */
    update(dt) {
        const body = this.body;
        let hit = 0;
        this.accumulator += dt;
        while (this.accumulator >= FALL.substep && !this.done) {
            this.accumulator -= FALL.substep;
            body.step(FALL.substep, this.landscape);
            this.time += FALL.substep;
            this.topSpeed = Math.max(this.topSpeed, body.speed);
            this.deepestCrush = Math.max(this.deepestCrush, body.penetration);
            if (body.impact > FALL.hitSpeed) hit = Math.max(hit, body.impact);
            const resting = body.speed < FALL.restSpeed && body.spin < FALL.restSpin;
            this.still = resting ? this.still + FALL.substep : 0;
        }
        this.hardestHit = Math.max(this.hardestHit, hit);
        if (this.hardestHit > FALL.wreckSpeed) body.rollingShare = 1;
        return hit;
    }

    get done() {
        return this.still >= FALL.restSeconds || this.time >= FALL.maxSeconds;
    }

    /** Where the car-space origin is and how the car is turned: the cabin and the camera ride on it. */
    get pose() {
        const q = this.body.orientation;
        return { position: sub(this.body.position, rotate(q, this.centre)), quaternion: q };
    }

    /** How far the car has fallen below the road it left (m). */
    get drop() {
        return this.startHeight - this.pose.position.y;
    }
}

/** Principal moments of a solid box (body frame: x across, y up, z along). */
function boxInertia(mass, width, height, length) {
    const k = mass / 12;
    return {
        x: k * (height * height + length * length),
        y: k * (width * width + length * length),
        z: k * (width * width + height * height),
    };
}

/** Points on the car's hull that can touch the ground, relative to the centre of mass: the four
 *  tyres (which roll), the sills, bumpers, waist and roof corners. */
function hull(b, centre) {
    const half = b.width / 2;
    const front = -b.eye;
    const rear = b.length - b.eye;
    const axles = b.wheels.map((w) => {
        return w.x - b.eye;
    });
    const points = [];
    for (const side of [-1, 1]) {
        for (const z of axles) points.push({ x: side * (half - FALL.wheelInset), y: 0, z, rolling: true });
        points.push(
            { x: side * half, y: FALL.sill, z: front + 0.1 },
            { x: side * half, y: FALL.sill, z: rear - 0.1 },
            { x: side * half * 0.8, y: FALL.sill + 0.25, z: front },
            { x: side * half * 0.8, y: FALL.sill + 0.25, z: rear },
            { x: side * half, y: FALL.belt, z: front + 0.4 },
            { x: side * half, y: FALL.belt, z: rear - 0.3 },
            { x: side * half, y: (FALL.sill + FALL.belt) / 2, z: 0 },
            { x: side * half * 0.75, y: b.height, z: -0.45 },
            { x: side * half * 0.75, y: b.height, z: 0.6 },
        );
    }
    points.push({ x: 0, y: FALL.sill, z: 0 }, { x: 0, y: b.height, z: 0.1 });
    return points.map((p) => {
        return { x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z, rolling: Boolean(p.rolling) };
    });
}
