import { CHASE, CRASH } from '../config.js';
import { DEG, approach, clamp, lerp } from '../util/math.js';

/** `angle` wrapped into -pi..pi. */
function wrapAngle(angle) {
    return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

/** The outside camera's yaw easing towards the car's `target` yaw, the short way round; it starts on
 *  the car's yaw when there is no `current` one yet. */
export function followYaw(current, target, dt) {
    if (current === null) return target;
    return current + approach(0, wrapAngle(target - current), CHASE.followRate, dt);
}

/** Where the outside camera sits and what it aims at for a car at `car` ({x, y, z}) seen along `yaw`
 *  (the car's y rotation: its front, local -z, points along (-sin yaw, 0, -cos yaw)). */
export function chasePose(car, yaw) {
    const backX = Math.sin(yaw);
    const backZ = Math.cos(yaw);
    return {
        position: [car.x + backX * CHASE.distance, car.y + CHASE.height, car.z + backZ * CHASE.distance],
        aim: [car.x - backX * CHASE.aimAhead, car.y + CHASE.aimHeight, car.z - backZ * CHASE.aimAhead],
    };
}

/** Watching a crash from `post` beside the road: while the car is near, from there; thrown further than
 *  CRASH.camera.follow, the camera glides after it to look down on it from above, on the post's side. */
export function spectatorPose(post, car) {
    const c = CRASH.camera;
    const away = Math.hypot(car.x - post.x, car.y - post.y, car.z - post.z);
    const across = Math.hypot(post.x - car.x, post.z - car.z) || 1;
    const back = c.follow * Math.cos(c.lookDownDeg * DEG);
    const above = [
        car.x + ((post.x - car.x) / across) * back,
        car.y + c.follow * Math.sin(c.lookDownDeg * DEG),
        car.z + ((post.z - car.z) / across) * back,
    ];
    const follow = clamp((away - c.follow) / c.follow, 0, 1);
    return {
        position: [lerp(post.x, above[0], follow), lerp(post.y, above[1], follow), lerp(post.z, above[2], follow)],
        aim: [car.x, car.y + c.aimUp, car.z],
    };
}

/** Under water after a sunk car at `car`: past it, seen from the way it went in (`from`, the roadside),
 *  a little above it but always below the surface at `seaLevel`, looking back at it and the shore. */
export function diverPose(car, from, seaLevel) {
    const d = CRASH.diver;
    const away = Math.hypot(car.x - from.x, car.z - from.z) || 1;
    const outX = (car.x - from.x) / away;
    const outZ = (car.z - from.z) / away;
    return {
        position: [car.x + outX * d.distance, Math.min(car.y + d.up, seaLevel - d.belowSurface), car.z + outZ * d.distance],
        aim: [car.x, car.y, car.z],
    };
}
