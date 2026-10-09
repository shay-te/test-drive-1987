import { FALL, WATER } from '../config.js';
import { fromEulerYXZ, rotate } from '../util/quaternion.js';
import { add, scale, vec } from '../util/vector.js';
import { RigidBody } from './RigidBody.js';

/** The player's car as a rigid body with its last motion. Car space is the cabin's: x right, y up from
 *  the road, z back, origin under the eye; `centre` is the centre of mass in it. */
export function playerBody(vehicle, track) {
    const b = vehicle.car.body;
    const c = vehicle.car.chassis;
    const centre = vec(0, c.cgHeight, b.wheels[0].x + vehicle.a - b.eye);
    const yaw = track.headingAt(vehicle.s) + vehicle.theta;
    const orientation = fromEulerYXZ(Math.atan(track.gradeAt(vehicle.s)), -yaw, 0);
    const ground = track.toWorld(vehicle.s, vehicle.u, 0);
    const forward = rotate(orientation, vec(0, 0, -1));
    const right = rotate(orientation, vec(1, 0, 0));
    const body = new RigidBody(
        {
            mass: c.massKg,
            inertia: boxInertia(c.massKg, b.width, b.height, b.length),
            points: hull(b.width, b.height, -b.eye, b.length - b.eye, b.wheels.map((w) => { return w.x - b.eye; }), centre),
            volume: b.width * b.height * b.length,
            dragArea: FALL.dragArea,
            contact: FALL,
            water: WATER,
        },
        {
            position: add(vec(ground.x, ground.y, ground.z), rotate(orientation, centre)),
            velocity: add(scale(forward, vehicle.vx), scale(right, vehicle.vy)),
            orientation,
            angularVelocity: rotate(orientation, vec(0, -vehicle.yawRate, 0)),
        },
    );
    return { body, centre, startHeight: ground.y };
}

/** A traffic vehicle as a rigid body moving as it drove. Its frame is the model's: centred, on the
 *  ground, front towards -z; `centre` is its centre of mass in it. */
export function trafficBody(vehicle, track, spec) {
    const centre = vec(0, spec.height * FALL.trafficCg, 0);
    const yaw = -track.headingAt(vehicle.s) + (vehicle.dir < 0 ? Math.PI : 0);
    const orientation = fromEulerYXZ(Math.atan(track.gradeAt(vehicle.s)) * vehicle.dir, yaw, 0);
    const ground = track.toWorld(vehicle.s, vehicle.u, 0);
    const half = vehicle.length / 2;
    const axle = half - Math.min(FALL.axleFromEnd, half / 2);
    const body = new RigidBody(
        {
            mass: spec.massKg,
            inertia: boxInertia(spec.massKg, vehicle.width, vehicle.height, vehicle.length),
            points: hull(vehicle.width, vehicle.height, -half, half, [-axle, axle], centre),
            volume: vehicle.width * vehicle.height * vehicle.length,
            dragArea: FALL.dragArea,
            contact: FALL,
            water: WATER,
        },
        {
            position: add(vec(ground.x, ground.y, ground.z), rotate(orientation, centre)),
            velocity: scale(rotate(orientation, vec(0, 0, -1)), vehicle.speed),
            orientation,
            angularVelocity: vec(),
        },
    );
    return { body, centre };
}

/** The air (m3) `body` has let out since it was `flooded` this full. */
export function airLost(body, flooded) {
    return (body.flooded - flooded) * body.volume * WATER.airShare;
}

/** `body` is under the surface at `sea`, deep enough to watch from beneath it. */
export function underwater(body, sea) {
    return body.position.y < sea - WATER.underwater;
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

/** Points on a car's hull that can touch the ground, relative to the centre of mass: the four tyres
 *  (which roll) at the `axles` (z), the sills, bumpers (`front`, `rear` z), waist and roof corners. */
function hull(width, height, front, rear, axles, centre) {
    const half = width / 2;
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
            { x: side * half * 0.75, y: height, z: -0.45 },
            { x: side * half * 0.75, y: height, z: 0.6 },
        );
    }
    points.push({ x: 0, y: FALL.sill, z: 0 }, { x: 0, y: height, z: 0.1 });
    return points.map((p) => {
        return { x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z, rolling: Boolean(p.rolling) };
    });
}
