import { DRIVER } from '../data/driver.js';
import { lerp } from '../util/math.js';
import { add, cross, dot, normalize, scale, sub, vec } from '../util/vector.js';

/** A gloved hand closed round a bar (the rim's tube, or the gear knob taken as one) of `radius` whose
 *  axis passes through `centre`: `along` the bar towards the index finger, `out` from the bar to the
 *  palm, `around` the way the fingers curl. The palm lies against the bar; each finger's bones close
 *  round it as chords, the thumb the other way. { wrist, palm: { centre, along, out, around }, fingers:
 *  [[knuckle, ..., tip]], thumb: [root, ..., tip] } in the bar's space. */
export function wrapHand({ centre, along, out, around, radius }) {
    const h = DRIVER.hand;
    const [, length, thick] = h.palm;
    const lift = radius + thick / 2;
    const onBar = (distance, angle, across) => {
        return add(centre, add(scale(along, across), add(scale(out, distance * Math.cos(angle)), scale(around, distance * Math.sin(angle)))));
    };
    const chain = (distance, across, start, bones, turn) => {
        let angle = start;
        return [onBar(distance, angle, across), ...bones.map((bone) => {
            angle += turn * 2 * Math.asin(Math.min(1, bone / (2 * distance)));
            return onBar(distance, angle, across);
        })];
    };
    const fingers = h.fingers.map((f) => { return chain(radius + f.radius, f.across, 0, f.bones, 1); });
    const t = h.thumb;
    const root = add(add(centre, scale(out, lift)), add(scale(around, -length * t.root), scale(along, t.across)));
    const thumb = [root, ...chain(radius + t.radius, t.across, -t.start, t.bones.slice(1), -1)];
    return {
        wrist: add(add(centre, scale(out, lift)), scale(around, -length)),
        palm: { centre: add(add(centre, scale(out, lift)), scale(around, -length / 2)), along, out, around },
        fingers,
        thumb,
    };
}

/** The rim at a grip: `grip` on the tube's axis, the wheel's `hub` and `axis` (towards the driver) and
 *  its `up` (towards twelve o'clock, turned with the wheel). The palm sits on the outside, leaning
 *  towards the driver; the index finger is the upper one; the fingers curl over the front. */
export function rimBar(grip, { hub, axis, up }) {
    const outward = normalize(sub(grip, hub));
    const tangent = normalize(cross(axis, outward));
    const along = dot(tangent, up) >= 0 ? tangent : scale(tangent, -1);
    const out = normalize(add(outward, scale(axis, DRIVER.hand.rimTilt)));
    return { centre: grip, along, out, around: curl(along, out, scale(axis, -1)), radius: DRIVER.hand.rim };
}

/** The gear knob from its top: the hand over it, the index finger towards the car's middle when the
 *  `side` (-1 left hand, 1 right) is the driver's, the fingers curling down its front. */
export function knobBar(top, side) {
    const r = DRIVER.hand.knob;
    const out = normalize(vec(0, 1, DRIVER.hand.knobTilt));
    return { centre: sub(top, vec(0, r, 0)), along: vec(-side, 0, 0), out, around: curl(vec(-side, 0, 0), out, vec(0, -0.5, -1)), radius: r };
}

/** The direction square to `along` and `out` that leans towards `towards`. */
function curl(along, out, towards) {
    const around = normalize(cross(along, out));
    return dot(around, towards) >= 0 ? around : scale(around, -1);
}

/** A hand `t` of the way from pose `a` to pose `b`, joint by joint. */
export function blendHands(a, b, t) {
    const mix = (p, q) => { return vec(lerp(p.x, q.x, t), lerp(p.y, q.y, t), lerp(p.z, q.z, t)); };
    const turn = (p, q) => { return normalize(mix(p, q)); };
    return {
        wrist: mix(a.wrist, b.wrist),
        palm: {
            centre: mix(a.palm.centre, b.palm.centre),
            along: turn(a.palm.along, b.palm.along),
            out: turn(a.palm.out, b.palm.out),
            around: turn(a.palm.around, b.palm.around),
        },
        fingers: a.fingers.map((joints, f) => { return joints.map((p, j) => { return mix(p, b.fingers[f][j]); }); }),
        thumb: a.thumb.map((p, j) => { return mix(p, b.thumb[j]); }),
    };
}
