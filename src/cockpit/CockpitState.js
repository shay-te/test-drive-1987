import { Spring } from '../util/math.js';
import { CLUSTERS } from './clusters.js';
import { DriverMotion } from './DriverMotion.js';
import { GATES, KNOB_TRAVEL, gatePosition, stepKnob } from './shiftGate.js';

/** The moving parts of a cockpit between frames: sprung needles, and the gear knob in its gate moved by
 *  the driver, whose hands and feet work the controls. */
export class CockpitState {
    constructor(car) {
        this.cluster = CLUSTERS[car.cockpit.cluster];
        this.gate = GATES[car.cockpit.shifter.pattern];
        this.needles = new Map(
            this.cluster.instruments.map((item) => {
                return [item, new Spring()];
            }),
        );
        this.knob = gatePosition(this.gate, 0);
        this.driver = new DriverMotion();
    }

    /** `pedals` = { throttle, brake } as the driver presses them (0..1). */
    update(dt, readings, gear, pedals) {
        for (const [item, spring] of this.needles) spring.update(readings[item.source] ?? 0, dt);
        const target = gatePosition(this.gate, gear);
        const shifting = this.knob[0] !== target[0] || this.knob[1] !== target[1];
        this.driver.update(dt, { shifting, ...pedals });
        if (this.driver.onKnob) this.knob = stepKnob(this.knob, target, KNOB_TRAVEL * dt);
    }

    /** Where the needle (or bar, or readout) of `item` currently points. */
    needle(item) {
        return this.needles.get(item).value;
    }
}
