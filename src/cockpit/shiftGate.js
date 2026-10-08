import { moveTowards } from '../util/math.js';

/** Shift gates: knob position of each gear as [column, row] (row -1 = forward, 0 = neutral rail). */
export const GATES = {
    porsche4: { columns: [-0.5, 0.5], gears: { 1: [-0.5, -1], 2: [-0.5, 1], 3: [0.5, -1], 4: [0.5, 1] } },
    dogleg5: { columns: [-1, 0, 1], gears: { 1: [-1, 1], 2: [0, -1], 3: [0, 1], 4: [1, -1], 5: [1, 1] } },
    overdrive: {
        columns: [-0.5, 0.5],
        gears: { 1: [-0.5, -1], 2: [-0.5, 1], 3: [0.5, -1], 4: [0.5, 1], 5: [0.5, 1] },
    },
};
const NEUTRAL = [0, 0];
/** Knob speed along the gate, in gate units per second. */
export const KNOB_TRAVEL = 9;

/** Knob position for `gear` in a gate (neutral sits on the rail between columns). */
export function gatePosition(gate, gear) {
    return gate.gears[gear] ?? NEUTRAL;
}

/** Next knob position on the way to `target`: through the neutral rail, never across the gate. */
export function stepKnob(knob, target, step) {
    const [x, y] = knob;
    if (Math.abs(x - target[0]) > 1e-3) {
        if (Math.abs(y) > 1e-3) return [x, moveTowards(y, 0, step)];
        return [moveTowards(x, target[0], step), y];
    }
    return [x, moveTowards(y, target[1], step)];
}
