import { CRASH } from '../config.js';

/** Decides which of a wreck's hits are heard: a car tumbling or settling touches the ground every
 *  step, but only a fresh, hard enough knock makes a sound (CRASH.sound). */
export class ImpactGate {
    constructor() {
        this.heardAt = -Infinity;
        this.heardSpeed = 0;
    }

    /** The volume (0..1) a hit of `speed` m/s at `time` s is heard at, or 0 when it is not heard. */
    hear(time, speed) {
        const { audible, cooldown, harder, loud } = CRASH.sound;
        if (speed < audible) return 0;
        if (time - this.heardAt < cooldown && speed < this.heardSpeed * harder) return 0;
        this.heardAt = time;
        this.heardSpeed = speed;
        return Math.min(1, speed / loud);
    }
}
