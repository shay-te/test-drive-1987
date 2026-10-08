import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CockpitState } from '../src/cockpit/CockpitState.js';
import { DriverMotion } from '../src/cockpit/DriverMotion.js';
import { driverPose, twoBone } from '../src/cockpit/driverPose.js';
import { gatePosition } from '../src/cockpit/shiftGate.js';
import { CARS } from '../src/data/cars.js';
import { DRIVER } from '../src/data/driver.js';
import { length, sub, vec } from '../src/util/vector.js';

const near = (a, b, tolerance = 1e-6) => { return length(sub(a, b)) < tolerance; };

test('a two-bone limb keeps its bone lengths, reaches what it can and points at what it cannot', () => {
    const root = vec(0, 0, 0);
    const reachable = twoBone(root, vec(0.4, 0, -0.2), 0.3, 0.3, vec(0, -1, 0));
    assert.ok(Math.abs(length(sub(reachable.joint, root)) - 0.3) < 1e-9);
    assert.ok(Math.abs(length(sub(reachable.end, reachable.joint)) - 0.3) < 1e-9);
    assert.ok(near(reachable.end, vec(0.4, 0, -0.2)));
    assert.ok(reachable.joint.y < 0, 'bends towards the pole');
    const far = twoBone(root, vec(2, 0, 0), 0.3, 0.3, vec(0, -1, 0));
    assert.ok(Math.abs(far.end.x - 0.6) < 1e-3 && Math.abs(far.end.y) < 1e-6, 'straight, pointing at it');
});

const rig = {
    eye: vec(-0.36, 1.06, 0),
    grips: [vec(-0.55, 0.8, -0.45), vec(-0.17, 0.8, -0.45)],
    knob: vec(0.02, 0.62, -0.42),
};

test('at rest both hands hold the rim and the feet sit on the throttle and the footrest', () => {
    const pose = driverPose(rig, new DriverMotion());
    assert.ok(near(pose.arms[0].hand, rig.grips[0], 1e-3) && near(pose.arms[1].hand, rig.grips[1], 1e-3));
    const p = DRIVER.pedals;
    assert.ok(Math.abs(pose.legs[1].ball.x - (rig.eye.x + p.throttle)) < 1e-9, 'right foot over the throttle');
    assert.ok(Math.abs(pose.legs[0].ball.x - (rig.eye.x + p.rest)) < 1e-9, 'left foot off the clutch');
    for (const leg of pose.legs) assert.ok(leg.knee.y > leg.hip.y - 0.05, 'knees up, not through the floor');
});

test('through a shift the gear-side hand goes to the knob and the left foot to the clutch, then back', () => {
    const motion = new DriverMotion();
    for (let i = 0; i < 30; i++) motion.update(1 / 60, { shifting: true, throttle: 0, brake: 0 });
    let pose = driverPose(rig, motion);
    assert.ok(near(pose.arms[1].hand, rig.knob, 0.02), 'right hand on the knob');
    assert.ok(near(pose.arms[0].hand, rig.grips[0], 1e-3), 'left hand stays on the wheel');
    assert.ok(Math.abs(pose.legs[0].ball.x - (rig.eye.x + DRIVER.pedals.clutch)) < 0.01, 'clutch down');
    for (let i = 0; i < 60; i++) motion.update(1 / 60, { shifting: false, throttle: 0, brake: 0 });
    pose = driverPose(rig, motion);
    assert.ok(near(pose.arms[1].hand, rig.grips[1], 0.01), 'back on the rim');
    // Right-hand drive: the knob is on the driver's left, so the left hand changes gear.
    const rhd = { eye: vec(0.37, 0.95, 0), grips: [vec(0.18, 0.75, -0.8), vec(0.56, 0.75, -0.8)], knob: vec(0, 0.62, -0.6) };
    for (let i = 0; i < 30; i++) motion.update(1 / 60, { shifting: true, throttle: 0, brake: 0 });
    pose = driverPose(rhd, motion);
    assert.ok(near(pose.arms[0].hand, rhd.knob, 0.02) && near(pose.arms[1].hand, rhd.grips[1], 1e-3));
});

test('braking moves the right foot over to the brake and presses it', () => {
    const motion = new DriverMotion();
    for (let i = 0; i < 60; i++) motion.update(1 / 60, { shifting: false, throttle: 0, brake: 1 });
    const pose = driverPose(rig, motion);
    const p = DRIVER.pedals;
    assert.ok(Math.abs(pose.legs[1].ball.x - (rig.eye.x + p.brake)) < 0.01, 'on the brake');
    assert.ok(pose.legs[1].ball.z < rig.eye.z - p.ahead - p.travel * 0.9, 'pressed home');
});

test('an out-of-reach target leans the shoulder in, keeping the arm nearly straight', () => {
    const deep = { ...rig, grips: [vec(-0.57, 0.71, -0.75), vec(-0.13, 0.71, -0.75)] };
    const pose = driverPose(deep, new DriverMotion());
    for (const [i, arm] of pose.arms.entries()) {
        assert.ok(near(arm.hand, deep.grips[i], 1e-3), 'the hand still holds the rim');
        assert.ok(arm.shoulder.z < rig.eye.z + DRIVER.shoulder.back, 'the shoulder came forward');
    }
});

test('the gear knob moves only once the hand has reached it, and the pedals follow the feet', () => {
    const car = CARS[0];
    const cockpit = new CockpitState(car);
    const readings = {};
    const neutral = [...cockpit.knob];
    cockpit.update(1 / 60, readings, 1, { throttle: 0, brake: 0 });
    assert.deepEqual(cockpit.knob, neutral, 'the hand is still on its way');
    let frames = 0;
    while (cockpit.knob[1] === neutral[1] && frames++ < 60) cockpit.update(1 / 60, readings, 1, { throttle: 0, brake: 0 });
    assert.ok(cockpit.driver.onKnob && frames > 3 && frames < 20, `the lever moved after ${frames} frames`);
    for (let i = 0; i < 60; i++) cockpit.update(1 / 60, readings, 1, { throttle: 1, brake: 0 });
    assert.deepEqual(cockpit.knob, gatePosition(cockpit.gate, 1), 'in first');
    assert.ok(cockpit.driver.reach < 0.05 && cockpit.driver.clutch < 0.05, 'hand back on the wheel, clutch up');
    assert.ok(cockpit.driver.throttle > 0.99, 'right foot down on the throttle');
});
