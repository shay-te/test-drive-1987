import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CockpitState } from '../src/cockpit/CockpitState.js';
import { DriverMotion } from '../src/cockpit/DriverMotion.js';
import { driverPose, twoBone } from '../src/cockpit/driverPose.js';
import { blendHands, handJoints, knobBar, rimBar, wrapHand } from '../src/cockpit/handPose.js';
import { gatePosition } from '../src/cockpit/shiftGate.js';
import { CARS } from '../src/data/cars.js';
import { DRIVER } from '../src/data/driver.js';
import { cross, dot, length, normalize, sub, vec } from '../src/util/vector.js';

const near = (a, b, tolerance = 1e-6) => { return length(sub(a, b)) < tolerance; };
/** How far `p` is from the axis of `bar` (a rimBar or knobBar). */
const fromAxis = (p, bar) => { return length(cross(sub(p, bar.centre), bar.along)); };

/** Every joint of `hand` wraps `bar` at each digit's own radius, and every bone has its real length
 *  (to within `tolerance` m: a hand still on its way is a hair off). */
function holds(hand, bar, tolerance = 1e-9) {
    const h = DRIVER.hand;
    hand.fingers.forEach((joints, f) => {
        for (const joint of joints) assert.ok(Math.abs(fromAxis(joint, bar) - (bar.radius + h.fingers[f].radius)) < tolerance, 'round the bar');
        h.fingers[f].bones.forEach((bone, b) => { assert.ok(Math.abs(length(sub(joints[b + 1], joints[b])) - bone) < tolerance, 'a real bone'); });
    });
    for (const joint of hand.thumb.slice(1)) assert.ok(Math.abs(fromAxis(joint, bar) - (bar.radius + h.thumb.radius)) < tolerance, 'the thumb too');
}

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

/** The Porsche's cockpit: the eye, the grips at quarter to three on a column tilted towards the driver,
 *  the gear knob's top. */
const wheel = { hub: vec(-0.36, 0.8, -0.45), axis: normalize(vec(0, 0.3, 1)), up: normalize(vec(0, 1, -0.3)) };
const rig = {
    eye: vec(-0.36, 1.06, 0),
    grips: [vec(-0.55, 0.8, -0.45), vec(-0.17, 0.8, -0.45)],
    wheel,
    knob: vec(0.02, 0.62, -0.42),
};

test('at rest both gloved hands close round the rim, index finger uppermost, fingers over the front', () => {
    const pose = driverPose(rig, new DriverMotion());
    pose.arms.forEach((arm, i) => {
        holds(arm.hand, rimBar(rig.grips[i], wheel));
        assert.ok(near(arm.wrist, arm.hand.wrist, 1e-6), 'the forearm ends at the wrist');
        assert.ok(arm.hand.fingers[0][0].y > arm.hand.fingers[3][0].y, 'index finger above the little one');
        for (const joints of arm.hand.fingers) assert.ok(joints.at(-1).z < joints[0].z, 'fingertips round the front of the rim');
    });
});

test('at rest the feet sit on the throttle and the footrest', () => {
    const pose = driverPose(rig, new DriverMotion());
    const p = DRIVER.pedals;
    assert.ok(Math.abs(pose.legs[1].ball.x - (rig.eye.x + p.throttle)) < 1e-9, 'right foot over the throttle');
    assert.ok(Math.abs(pose.legs[0].ball.x - (rig.eye.x + p.rest)) < 1e-9, 'left foot off the clutch');
    for (const leg of pose.legs) assert.ok(leg.knee.y > leg.hip.y - 0.05, 'knees up, not through the floor');
});

test('through a shift the gear-side hand goes to the knob and the left foot to the clutch, then back', () => {
    const motion = new DriverMotion();
    for (let i = 0; i < 30; i++) motion.update(1 / 60, { shifting: true, throttle: 0, brake: 0 });
    let pose = driverPose(rig, motion);
    assert.ok(motion.reach > 0.999);
    holds(pose.arms[1].hand, knobBar(rig.knob, 1), 1e-3);
    holds(pose.arms[0].hand, rimBar(rig.grips[0], wheel));
    assert.ok(Math.abs(pose.legs[0].ball.x - (rig.eye.x + DRIVER.pedals.clutch)) < 0.01, 'clutch down');
    for (let i = 0; i < 60; i++) motion.update(1 / 60, { shifting: false, throttle: 0, brake: 0 });
    pose = driverPose(rig, motion);
    assert.ok(near(pose.arms[1].hand.wrist, driverPose(rig, new DriverMotion()).arms[1].hand.wrist, 0.01), 'back on the rim');
    // Right-hand drive: the knob is on the driver's left, so the left hand changes gear.
    const rhdWheel = { ...wheel, hub: vec(0.37, 0.75, -0.8) };
    const rhd = { eye: vec(0.37, 0.95, 0), grips: [vec(0.18, 0.75, -0.8), vec(0.56, 0.75, -0.8)], wheel: rhdWheel, knob: vec(0, 0.62, -0.6) };
    for (let i = 0; i < 30; i++) motion.update(1 / 60, { shifting: true, throttle: 0, brake: 0 });
    pose = driverPose(rhd, motion);
    holds(pose.arms[0].hand, knobBar(rhd.knob, -1), 1e-3);
    holds(pose.arms[1].hand, rimBar(rhd.grips[1], rhdWheel));
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
    const deepWheel = { ...wheel, hub: vec(-0.35, 0.71, -0.75) };
    const deep = { ...rig, grips: [vec(-0.57, 0.71, -0.75), vec(-0.13, 0.71, -0.75)], wheel: deepWheel };
    const pose = driverPose(deep, new DriverMotion());
    for (const [i, arm] of pose.arms.entries()) {
        holds(arm.hand, rimBar(deep.grips[i], deepWheel));
        assert.ok(near(arm.wrist, arm.hand.wrist, 1e-6), 'the arm still reaches the hand on the rim');
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

test('the hand rig gets all 25 WebXR joints, each bone pointing at the next and its back away from the bar', () => {
    const bar = rimBar(vec(-0.55, 0.85, -0.4), wheel);
    const onRim = wrapHand(bar);
    const onKnob = wrapHand(knobBar(vec(0.05, 0.6, -0.35), 1));
    for (const hand of [onRim, blendHands(onRim, onKnob, 0.5), onKnob]) {
        const joints = handJoints(hand);
        const byName = Object.fromEntries(joints.map((joint) => { return [joint.name, joint]; }));
        assert.equal(joints.length, 25);
        for (const prefix of ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']) {
            for (const name of ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']) assert.ok(byName[`${prefix}-${name}`], `${prefix}-${name}`);
        }
        for (const { name, x, y, z } of joints) {
            for (const [a, b] of [[x, y], [y, z], [z, x]]) assert.ok(Math.abs(dot(a, b)) < 1e-9, `${name}: square axes`);
            assert.ok(Math.abs(length(x) - 1) < 1e-9 && Math.abs(length(y) - 1) < 1e-9 && Math.abs(length(z) - 1) < 1e-9, `${name}: unit axes`);
            assert.ok(dot(cross(x, y), z) > 0.999, `${name}: right-handed`);
        }
        const along = (from, to) => {
            const bone = normalize(sub(byName[to].position, byName[from].position));
            assert.ok(dot(scaleBack(byName[from].z), bone) > 0.999, `${from}: -z points at ${to}`);
        };
        along('wrist', 'middle-finger-phalanx-proximal');
        along('index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate');
        along('pinky-finger-phalanx-distal', 'pinky-finger-tip');
        along('thumb-phalanx-proximal', 'thumb-phalanx-distal');
        const middle = byName['middle-finger-phalanx-intermediate'];
        assert.ok(dot(middle.y, normalize(sub(middle.position, hand.bar))) > 0.5, 'the back of the finger faces away from the bar');
        assert.ok(dot(byName.wrist.y, hand.palm.out) > 0.95, 'the back of the hand faces out');
    }
});

function scaleBack(v) {
    return vec(-v.x, -v.y, -v.z);
}
