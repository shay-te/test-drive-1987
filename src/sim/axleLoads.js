import { PHYS, TYRES } from '../config.js';
import { clamp } from '../util/math.js';

/** Loads (N) on the front and rear axles of `chassis` accelerating at `accel` m/s²: weight moves back
 *  under acceleration (forward under braking) as far as the suspension passes it to the tyres. */
export function axleLoads(chassis, accel) {
    const weight = chassis.massKg * PHYS.g;
    const front = weight * chassis.frontWeight;
    const rear = weight - front;
    const a = clamp(accel, -1.2 * PHYS.g, 1.2 * PHYS.g);
    const transfer = clamp((TYRES.transfer * chassis.massKg * chassis.cgHeight * a) / chassis.wheelbase, -rear * TYRES.maxTransfer, front * TYRES.maxTransfer);
    return { front: front - transfer, rear: rear + transfer };
}

/** The most the driven rear tyres of `chassis` can push it straight ahead on dry asphalt while it
 *  accelerates at `accel` m/s² (N). */
export function driveGrip(chassis, accel) {
    return chassis.grip * TYRES.peak * TYRES.rear * TYRES.longitudinal * axleLoads(chassis, accel).rear * TYRES.budget;
}
