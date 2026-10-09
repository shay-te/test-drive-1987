import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASE, CRASH } from '../src/config.js';
import { chasePose, followYaw, spectatorPose } from '../src/world/chaseView.js';

const car = { x: 10, y: 50, z: -20 };

test('the outside camera sits behind and above the car, aiming ahead of it', () => {
    // Yaw 0: the car faces -z, so behind it is +z.
    const { position, aim } = chasePose(car, 0);
    assert.deepEqual(position, [10, 50 + CHASE.height, -20 + CHASE.distance]);
    assert.deepEqual(aim, [10, 50 + CHASE.aimHeight, -20 - CHASE.aimAhead]);
    // A quarter turn left (yaw +pi/2): the car faces -x, so the camera is at +x.
    const turned = chasePose(car, Math.PI / 2);
    assert.ok(Math.abs(turned.position[0] - (10 + CHASE.distance)) < 1e-9);
    assert.ok(Math.abs(turned.position[2] - -20) < 1e-9);
});

test('the camera yaw starts on the car, then eases after it without overshooting', () => {
    assert.equal(followYaw(null, 1.2, 1 / 60), 1.2);
    let yaw = 0;
    for (let frame = 0; frame < 30; frame++) {
        const next = followYaw(yaw, 1, 1 / 60);
        assert.ok(next > yaw && next < 1, 'moves towards the car, never past it');
        yaw = next;
    }
    for (let frame = 0; frame < 600; frame++) yaw = followYaw(yaw, 1, 1 / 60);
    assert.ok(Math.abs(yaw - 1) < 1e-6, 'settles on the car');
});

test('across the +-pi seam the camera turns the short way round', () => {
    const next = followYaw(Math.PI - 0.05, -Math.PI + 0.05, 1 / 60);
    assert.ok(next > Math.PI - 0.05, 'keeps turning the same way instead of swinging back through 0');
});

test('a crash is watched from beside the road while the car is near, and followed when it is thrown far', () => {
    const post = { x: 0, y: 50, z: 0 };
    const near = { x: 6, y: 47, z: -8 };
    const close = spectatorPose(post, near);
    assert.deepEqual(close.position, [post.x, post.y, post.z], 'from the roadside');
    assert.deepEqual(close.aim, [near.x, near.y + CRASH.camera.aimUp, near.z]);
    const far = { x: 60, y: -40, z: -30 };
    const { position } = spectatorPose(post, far);
    const away = Math.hypot(position[0] - far.x, position[1] - far.y, position[2] - far.z);
    assert.ok(Math.abs(away - CRASH.camera.follow) < 1e-9, 'it keeps its distance');
    assert.ok(position[1] > far.y, 'looking down on the car, over the slope it fell down');
    const towards = (position[0] - far.x) * (post.x - far.x) + (position[2] - far.z) * (post.z - far.z);
    assert.ok(towards > 0, 'from the side it was watched from');
});
