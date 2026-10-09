import { clamp } from '../util/math.js';
import { rotate } from '../util/quaternion.js';
import { add, cross, dot, length, scale, sub, vec } from '../util/vector.js';

/** A trunk is tried against a body's box at heights this far apart (m). */
const TRUNK_STEP = 0.3;
const AXES = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)];
const KEYS = ['x', 'y', 'z'];

/** The trees' trunks hold `body` off: each one met by its box is pressed out of the box's way.
 *  Returns the hardest closing speed (m/s). */
export function trunkContacts(body, trunks, dt) {
    const { min, max } = body.box;
    const reach = Math.max(length(min), length(max));
    let impact = 0;
    for (const trunk of trunks.near(body.position.x, body.position.z, reach)) {
        const low = Math.max(trunk.base, body.position.y - reach);
        const high = Math.min(trunk.top, body.position.y + reach);
        for (let y = low; y <= high; y += TRUNK_STEP) {
            const contact = boxContact(body, vec(trunk.x, y, trunk.z), trunk.radius);
            if (contact) impact = Math.max(impact, press(body, contact.point, contact.depth, scale(contact.normal, -1), null, dt));
        }
    }
    body.impact = Math.max(body.impact, impact);
    return impact;
}

/** Two bodies of a wreck meet: every hull point of one inside the other's box presses them apart.
 *  Returns the hardest closing speed (m/s). */
export function bodyContacts(a, b, dt) {
    let impact = 0;
    for (const [into, from] of [[b, a], [a, b]]) {
        for (const point of from.points) {
            const p = add(from.position, rotate(from.orientation, point));
            const contact = boxContact(into, p, 0);
            if (contact) impact = Math.max(impact, press(from, p, contact.depth, contact.normal, into, dt));
        }
    }
    for (const body of [a, b]) body.impact = Math.max(body.impact, impact);
    return impact;
}

/** Any hull point of either body is inside the other's box. */
export function overlaps(a, b) {
    for (const [into, from] of [[b, a], [a, b]]) {
        for (const point of from.points) {
            if (boxContact(into, add(from.position, rotate(from.orientation, point)), 0)) return true;
        }
    }
    return false;
}

/** World point `q` within `radius` of `body`'s box: the nearest point of the box (world), how deep `q`'s
 *  reach goes into it, and the way out of the box towards `q` (unit, world); a point inside the box
 *  leaves through its nearest face. Null if `q` is further off. */
function boxContact(body, q, radius) {
    const l = body.local(q);
    const { min, max } = body.box;
    const nearest = vec(clamp(l.x, min.x, max.x), clamp(l.y, min.y, max.y), clamp(l.z, min.z, max.z));
    const off = sub(l, nearest);
    const distance = length(off);
    const world = (v) => { return rotate(body.orientation, v); };
    if (distance > 1e-6) {
        if (distance >= radius) return null;
        return { point: add(body.position, world(nearest)), depth: radius - distance, normal: world(scale(off, 1 / distance)) };
    }
    let exit = null;
    KEYS.forEach((k, i) => {
        for (const [gap, sign] of [[l[k] - min[k], -1], [max[k] - l[k], 1]]) {
            if (!exit || gap < exit.gap) exit = { gap, axis: scale(AXES[i], sign) };
        }
    });
    return { point: q, depth: exit.gap + radius, normal: world(exit.axis) };
}

/** Point `p` (world) of `body` pressed `depth` m into something, to be pushed out along `normal` (unit,
 *  world): the ground's crushing spring, damper and friction as an impulse over `dt`; `other` (a body)
 *  takes the opposite, a fixed obstacle (null) nothing. Returns the closing speed (m/s). */
function press(body, p, depth, normal, other, dt) {
    const r = sub(p, body.position);
    const ro = other ? sub(p, other.position) : null;
    let v = add(body.velocity, cross(body.angularVelocity, r));
    if (other) v = sub(v, add(other.velocity, cross(other.angularVelocity, ro)));
    const vn = dot(v, normal);
    const c = body.contact;
    const fn = Math.max(0, c.stiffness * depth - c.damping * vn);
    if (!fn) return 0;
    const slide = sub(v, scale(normal, vn));
    const slip = length(slide);
    const friction = slip > 1e-6 ? scale(slide, -Math.min(c.friction * fn, c.grip * slip) / slip) : vec();
    const impulse = scale(add(scale(normal, fn), friction), dt);
    body.push(r, impulse);
    if (other) other.push(ro, scale(impulse, -1));
    return Math.max(0, -vn);
}
