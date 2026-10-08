import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK } from '../src/config.js';
import { HeadMotion } from '../src/cockpit/HeadMotion.js';
import { InputManager } from '../src/core/InputManager.js';
import { carById } from '../src/data/cars.js';
import { VehicleDynamics } from '../src/sim/VehicleDynamics.js';

const DT = 1 / 120;
const stationary = new VehicleDynamics(carById('porsche')).telemetry();

function settle(head, input, frames = 240) {
    let pose;
    for (let i = 0; i < frames; i++) pose = head.update(DT, stationary, input);
    return pose;
}

test('look-around reaches the rear cabin and stays within seated rotation limits', () => {
    const head = new HeadMotion();
    const pose = settle(head, { yaw: 1, pitch: -1 }, 1200);
    assert.equal(head.lookYaw, LOOK.yawLimit);
    assert.equal(head.lookPitch, -LOOK.pitchDown);
    assert.ok(pose.yaw <= -Math.PI / 2);
    assert.ok(pose.yaw >= -LOOK.yawLimit && pose.pitch >= -LOOK.pitchDown);
    assert.equal(pose.x, 0);
    assert.equal(pose.z, 0);
});

test('pointer look persists and centre restores forward view', () => {
    const head = new HeadMotion();
    head.update(DT, stationary, { pointerX: 200, pointerY: -100 });
    const pose = settle(head, {});
    assert.ok(pose.yaw < -0.7 && pose.pitch > 0.3);
    head.update(DT, stationary, { center: true });
    const forward = settle(head, {});
    assert.ok(Math.abs(forward.yaw) < 0.001 && Math.abs(forward.pitch) < 0.001);
});

test('keyboard looking coexists with steering and recentres on C', () => {
    const keyboard = new EventTarget();
    const input = new InputManager(keyboard, null);
    const key = (type, code) => {
        const event = new Event(type);
        event.code = code;
        event.key = code;
        keyboard.dispatchEvent(event);
    };
    for (const code of ['ArrowLeft', 'KeyE', 'KeyR']) key('keydown', code);
    assert.equal(input.steering(), -1);
    assert.equal(input.look().yaw, 1);
    assert.equal(input.look().pitch, 1);
    key('keydown', 'KeyC');
    assert.equal(input.look().center, true);
    input.endFrame();
    assert.equal(input.look().center, false);
    keyboard.dispatchEvent(new Event('blur'));
    assert.equal(input.look().yaw, 0);
    assert.equal(input.steering(), 0);
});


test('gamepad look uses the right stick with a deadzone and its centre button', () => {
    const input = new InputManager(new EventTarget(), null);
    input.padLook = [0.1, -0.1];
    assert.equal(input.look().yaw, 0);
    input.padLook = [0.8, -0.4];
    assert.equal(input.look().yaw, 0.8);
    assert.equal(input.look().pitch, 0.4);
    input.padButtons[11] = true;
    assert.equal(input.look().center, true);
});
