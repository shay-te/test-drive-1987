import { DRIVER } from '../data/driver.js';
import { lerp } from '../util/math.js';
import { blendHands, knobBar, rimBar, wrapHand } from './handPose.js';
import { add, dot, length, normalize, scale, sub, vec } from '../util/vector.js';

/** A two-bone limb (`a` then `b` long) from `root` reaching for `target`, its middle joint bending
 *  towards `pole` (a direction): { joint, end }. Out of reach, the limb points at the target, straight. */
export function twoBone(root, target, a, b, pole) {
    const toward = sub(target, root);
    const dist = Math.min(Math.max(length(toward), Math.abs(a - b) + 1e-4), a + b - 1e-4);
    const dir = normalize(toward);
    const along = (a * a + dist * dist - b * b) / (2 * dist);
    const height = Math.sqrt(Math.max(0, a * a - along * along));
    const bend = normalize(sub(pole, scale(dir, dot(pole, dir))));
    return { joint: add(add(root, scale(dir, along)), scale(bend, height)), end: add(root, scale(dir, dist)) };
}

/** The driver's limbs in car space. `rig` = { eye, grips: [left, right] (on the rim's tube, turned with
 *  the wheel), wheel: { hub, axis, up }, knob (its top) }; `motion` is a DriverMotion. Each hand closes
 *  round the rim, the gear hand round the knob through a shift; the arms reach for the wrists. Pedals
 *  are clutch, brake, throttle from left to right in any car; the hand nearer the knob changes gear
 *  (the left one in a right-hand-drive car). */
export function driverPose(rig, motion) {
    const { eye, grips, knob, wheel } = rig;
    const at = (from, across, down, back) => {
        return vec(from.x + across, from.y - down, from.z + back);
    };
    const s = DRIVER.shoulder;
    const h = DRIVER.hip;
    const p = DRIVER.pedals;
    const reachHand = knob.x > eye.x ? 1 : 0;
    const arms = [-1, 1].map((side, i) => {
        const onRim = wrapHand(rimBar(grips[i], wheel));
        const hand = i === reachHand && motion.reach > 0 ? blendHands(onRim, wrapHand(knobBar(knob, side)), motion.reach) : onRim;
        const shoulder = leanTowards(at(eye, side * s.across, s.down, s.back), hand.wrist);
        const pole = vec(side * DRIVER.elbowPole[0], DRIVER.elbowPole[1], DRIVER.elbowPole[2]);
        const { joint, end } = twoBone(shoulder, hand.wrist, DRIVER.upperArm, DRIVER.forearm, pole);
        return { shoulder, elbow: joint, wrist: end, hand };
    });
    const pedal = (across, pressed) => {
        return at(eye, across, p.down + pressed * p.travel * 0.3, -p.ahead - pressed * p.travel);
    };
    const right = lerpVec(pedal(p.throttle, motion.throttle), pedal(p.brake, motion.brake), motion.brakeFoot);
    const left = lerpVec(pedal(p.rest, 0), pedal(p.clutch, motion.clutch), motion.clutch);
    const legs = [left, right].map((ball, i) => {
        const hip = at(eye, (i === 0 ? -1 : 1) * h.across, h.down, h.back);
        const ankle = vec(ball.x, ball.y + DRIVER.ankle.up, ball.z + DRIVER.ankle.back);
        const { joint, end } = twoBone(hip, ankle, DRIVER.thigh, DRIVER.shin, vec(...DRIVER.kneePole));
        return { hip, knee: joint, ankle: end, ball };
    });
    return { arms, legs, eye };
}

/** A shoulder leans in along the arm when the hand's target is further than a nearly straight arm. */
function leanTowards(shoulder, target) {
    const toward = sub(target, shoulder);
    const excess = length(toward) - (DRIVER.upperArm + DRIVER.forearm) * DRIVER.straightArm;
    return excess > 0 ? add(shoulder, scale(normalize(toward), excess)) : shoulder;
}

function lerpVec(a, b, t) {
    return vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}
