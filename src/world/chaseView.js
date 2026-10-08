import { CHASE } from '../config.js';
import { approach } from '../util/math.js';

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
