import { add, cross, scale } from './vector.js';

/** Unit quaternions {x, y, z, w} with three.js's conventions, for rotations in the simulation. */

/** Rotation for Euler angles in three.js's 'YXZ' order (yaw, then pitch, then roll). */
export function fromEulerYXZ(pitch, yaw, roll) {
    const c1 = Math.cos(pitch / 2);
    const c2 = Math.cos(yaw / 2);
    const c3 = Math.cos(roll / 2);
    const s1 = Math.sin(pitch / 2);
    const s2 = Math.sin(yaw / 2);
    const s3 = Math.sin(roll / 2);
    return {
        x: s1 * c2 * c3 + c1 * s2 * s3,
        y: c1 * s2 * c3 - s1 * c2 * s3,
        z: c1 * c2 * s3 - s1 * s2 * c3,
        w: c1 * c2 * c3 + s1 * s2 * s3,
    };
}

export function conjugate(q) {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** `v` rotated by `q`. */
export function rotate(q, v) {
    const t = scale(cross(q, v), 2);
    return add(add(v, scale(t, q.w)), cross(q, t));
}

/** Advances `q` by world-space angular velocity `omega` (rad/s) over `dt`, renormalised. */
export function integrate(q, omega, dt) {
    const h = dt / 2;
    const x = q.x + h * (omega.x * q.w + omega.y * q.z - omega.z * q.y);
    const y = q.y + h * (omega.y * q.w + omega.z * q.x - omega.x * q.z);
    const z = q.z + h * (omega.z * q.w + omega.x * q.y - omega.y * q.x);
    const w = q.w - h * (omega.x * q.x + omega.y * q.y + omega.z * q.z);
    const n = Math.hypot(x, y, z, w);
    return { x: x / n, y: y / n, z: z / n, w: w / n };
}
