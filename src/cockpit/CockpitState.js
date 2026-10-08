import { Spring } from '../util/math.js';
import { CLUSTERS } from './clusters.js';
import { GATES, KNOB_TRAVEL, gatePosition, stepKnob } from './shiftGate.js';

/** The moving parts of a cockpit between frames: sprung needles and the gear knob in its gate. */
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
    }

    update(dt, readings, gear) {
        for (const [item, spring] of this.needles) spring.update(readings[item.source] ?? 0, dt);
        this.knob = stepKnob(this.knob, gatePosition(this.gate, gear), KNOB_TRAVEL * dt);
    }

    /** Where the needle (or bar, or readout) of `item` currently points. */
    needle(item) {
        return this.needles.get(item).value;
    }
}
