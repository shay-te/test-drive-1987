import { DRIVER } from '../data/driver.js';
import { approach } from '../util/math.js';

/** How the driver's hands and feet move between frames: a hand to the knob through each shift, the
 *  left foot on the clutch while it lasts, the right foot between throttle and brake. */
export class DriverMotion {
    constructor() {
        this.reach = 0;
        this.clutch = 0;
        this.brakeFoot = 0;
        this.throttle = 0;
        this.brake = 0;
        this.hold = 0;
    }

    /** `shifting` while the knob has a gear to go to; `throttle` and `brake` are the pedals (0..1). */
    update(dt, { shifting, throttle, brake }) {
        const m = DRIVER.motion;
        this.hold = shifting ? m.hold : Math.max(0, this.hold - dt);
        const busy = this.hold > 0 ? 1 : 0;
        this.reach = approach(this.reach, busy, m.hand, dt);
        this.clutch = approach(this.clutch, busy, m.foot, dt);
        this.brakeFoot = approach(this.brakeFoot, brake > 0 ? 1 : 0, m.foot, dt);
        this.throttle = approach(this.throttle, throttle, m.pedal, dt);
        this.brake = approach(this.brake, brake, m.pedal, dt);
    }

    /** The hand has the knob: the lever moves with it. */
    get onKnob() {
        return this.reach > DRIVER.motion.grip;
    }
}
