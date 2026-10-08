import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALL, PHYS } from '../src/config.js';
import { RigidBody } from '../src/sim/RigidBody.js';
import { fromEulerYXZ, rotate } from '../src/util/quaternion.js';
import { add, dot, length, vec } from '../src/util/vector.js';

const STEP = FALL.substep;
const SIZE = { x: 1.8, y: 1.3, z: 4.3 };
const MASS = 1400;

/** A plane through the origin tilted `deg` degrees downhill towards -x. */
const slope = (deg) => {
    const k = Math.tan((deg * Math.PI) / 180);
    const n = 1 / Math.hypot(k, 1);
    return {
        heightAt: (x) => {
            return x * k;
        },
        normalAt: () => {
            return { x: -k * n, y: n, z: 0 };
        },
    };
};

/** A solid box with a contact point at each corner. */
function box(state) {
    const points = [];
    for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
            for (const z of [-1, 1])
                points.push({ x: (x * SIZE.x) / 2, y: (y * SIZE.y) / 2, z: (z * SIZE.z) / 2 });
        }
    }
    const k = MASS / 12;
    return new RigidBody(
        {
            mass: MASS,
            inertia: {
                x: k * (SIZE.y ** 2 + SIZE.z ** 2),
                y: k * (SIZE.x ** 2 + SIZE.z ** 2),
                z: k * (SIZE.x ** 2 + SIZE.y ** 2),
            },
            points,
            dragArea: 0,
            contact: FALL,
        },
        {
            position: vec(0, 3, 0),
            velocity: vec(),
            orientation: fromEulerYXZ(0, 0, 0),
            angularVelocity: vec(),
            ...state,
        },
    );
}

const energy = (body) => {
    const w = rotate(
        { ...body.orientation, x: -body.orientation.x, y: -body.orientation.y, z: -body.orientation.z },
        body.angularVelocity,
    );
    const I = body.inertia;
    const spin = 0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z);
    return body.mass * PHYS.g * body.position.y + 0.5 * body.mass * dot(body.velocity, body.velocity) + spin;
};

const run = (body, ground, seconds) => {
    for (let t = 0; t < seconds; t += STEP) body.step(STEP, ground);
};

test('a box dropped on flat ground settles on its corners and never gains energy', () => {
    const ground = slope(0);
    const body = box();
    const start = energy(body);
    for (let t = 0; t < 4; t += STEP) {
        body.step(STEP, ground);
        assert.ok(energy(body) <= start + 1, `energy rose to ${energy(body)} from ${start}`);
    }
    assert.ok(body.speed < 0.05 && body.spin < 0.05, `still moving: ${body.speed}, ${body.spin}`);
    const lowest = Math.min(
        ...body.points.map((p) => {
            return add(body.position, rotate(body.orientation, p)).y;
        }),
    );
    assert.ok(Math.abs(lowest) < 0.01, `lowest corner at ${lowest}`);
});

test('a box sliding on flat ground stops', () => {
    const body = box({ position: vec(0, SIZE.y / 2, 0), velocity: vec(3, 0, 0) });
    run(body, slope(0), 3);
    assert.ok(body.speed < 0.02, `still sliding at ${body.speed} m/s`);
});

test('friction holds on a gentle slope and lets go on a steep one', () => {
    for (const [deg, holds] of [
        [15, true],
        [45, false],
    ]) {
        const ground = slope(deg);
        const body = box({
            orientation: fromEulerYXZ(0, 0, (deg * Math.PI) / 180),
            position: vec(0, SIZE.y / 2 + 0.01, 0),
        });
        run(body, ground, 0.5);
        const from = body.position.x;
        run(body, ground, 2);
        const moved = Math.abs(body.position.x - from);
        assert.equal(moved < 0.05, holds, `${deg} deg: moved ${moved} m`);
    }
});

test('a box tipped up on an edge falls over onto a face', () => {
    const body = box({ orientation: fromEulerYXZ(0, 0, 1.1), position: vec(0, 1.3, 0) });
    run(body, slope(0), 6);
    const axes = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)].map((a) => {
        return Math.abs(rotate(body.orientation, a).y);
    });
    assert.ok(Math.max(...axes) > 0.99, `resting tilted: ${axes}`);
    assert.ok(length(body.velocity) < 0.05);
});
