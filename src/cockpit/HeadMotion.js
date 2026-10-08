import { LOOK, MOTION, PHYS } from '../config.js';
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
        this.lookYaw = 0;
        this.lookPitch = 0;
    }

    /** `car` = {latAccel, longAccel, speed, surface}; `look` contains axes, pointer deltas, and a centre request.
     *  Returns the head's offset from the seated eye (m) and its rotation (rad). */
    update(dt, car, look = {}) {
        const { yaw = 0, pitch = 0, pointerX = 0, pointerY = 0, center = false, view = null } = look;
        this.lookYaw = center ? 0 : clamp(this.lookYaw + yaw * LOOK.speed * dt + pointerX * LOOK.pointerSensitivity, -LOOK.yawLimit, LOOK.yawLimit);
        this.lookPitch = center ? 0 : clamp(this.lookPitch + pitch * LOOK.speed * dt - pointerY * LOOK.pointerSensitivity, -LOOK.pitchDown, LOOK.pitchUp);
        if (view) {
            this.lookYaw = clamp(view.yaw, -LOOK.yawLimit, LOOK.yawLimit);
            this.lookPitch = clamp(view.pitch, -LOOK.pitchDown, LOOK.pitchUp);
        }
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
            pitch: clamp(this.pitch.update(long * MOTION.headPitchPerG + this.lookPitch, dt), -LOOK.pitchDown, LOOK.pitchUp),
            roll: this.roll.update(lat * MOTION.headRollPerG, dt),
            yaw: clamp(this.yaw.update(-this.lookYaw, dt), -LOOK.yawLimit, LOOK.yawLimit),
        };
    }

    /** Throws the head forward and up on impact (`impact` in m/s). */
    jolt(impact) {
        this.z.kick(-impact * MOTION.impactKick);
        this.y.kick(impact * MOTION.impactKick * 0.5);
        this.pitch.kick(-impact * MOTION.impactKick * 2);
    }
}
