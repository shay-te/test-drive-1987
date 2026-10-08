import { MOTION, PHYS } from '../config.js';
import { Noise, Spring, clamp } from '../util/math.js';

const BUZZ_SPEED = 30;

/** The driver's head on its neck: leans out in bends, nods under braking and power, buzzes on
 *  rough ground, jolts in a crash and turns to look out of the side windows. */
export class HeadMotion {
    constructor(seed = 1) {
        this.noise = new Noise(seed);
        this.x = new Spring(55, 10);
        this.y = new Spring(90, 13);
        this.z = new Spring(55, 10);
        this.pitch = new Spring(60, 11);
        this.roll = new Spring(55, 10);
        this.yaw = new Spring(30, 11);
        this.distance = 0;
    }

    /** `car` = {latAccel, longAccel, speed, surface}; `look` -1 (left) .. 1 (right).
     *  Returns the head's offset from the seated eye (m) and its rotation (rad). */
    update(dt, car, look = 0) {
        const lat = car.latAccel / PHYS.g;
        const long = car.longAccel / PHYS.g;
        this.distance += Math.abs(car.speed) * dt;
        const amplitude =
            (MOTION.buzz[car.surface] ?? MOTION.buzz.asphalt) * clamp(car.speed / BUZZ_SPEED, 0, 1.5);
        const buzz = amplitude * this.noise.noise1(this.distance * MOTION.buzzPerMetre);
        return {
            x: this.x.update(-lat * MOTION.leanPerG, dt),
            y: this.y.update(0, dt) + buzz,
            z: this.z.update(long * MOTION.nodPerG, dt),
            pitch: this.pitch.update(long * MOTION.headPitchPerG, dt),
            roll: this.roll.update(lat * MOTION.headRollPerG, dt),
            yaw: this.yaw.update(-look * MOTION.lookYaw, dt),
        };
    }

    /** Throws the head forward and up on impact (`impact` in m/s). */
    jolt(impact) {
        this.z.kick(-impact * MOTION.impactKick);
        this.y.kick(impact * MOTION.impactKick * 0.5);
        this.pitch.kick(-impact * MOTION.impactKick * 2);
    }
}
