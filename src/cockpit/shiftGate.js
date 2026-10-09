import { REVERSE } from '../sim/Drivetrain.js';
import { moveTowards } from '../util/math.js';

/** Shift gates: knob position of each gear and of reverse as [column, row] (row -1 = forward, 0 = the
 *  neutral rail). The 930's reverse is left of 1-2 and forward, past a stiff detent; the Testarossa's
 *  and Countach's above the dog-leg first, behind a lockout; the Esprit's (Citroën box) back from
 *  fifth under a lift lockout; the Corvette's left and forward under the lift ring. */
export const GATES = {
    porsche4: {
        columns: [-1.5, -0.5, 0.5],
        gears: { 1: [-0.5, -1], 2: [-0.5, 1], 3: [0.5, -1], 4: [0.5, 1] },
        reverse: [-1.5, -1],
    },
    dogleg5: {
        columns: [-1, 0, 1],
        gears: { 1: [-1, 1], 2: [0, -1], 3: [0, 1], 4: [1, -1], 5: [1, 1] },
        reverse: [-1, -1],
    },
    h5: {
        columns: [-1, 0, 1],
        gears: { 1: [-1, -1], 2: [-1, 1], 3: [0, -1], 4: [0, 1], 5: [1, -1] },
        reverse: [1, 1],
    },
    overdrive: {
        columns: [-1.5, -0.5, 0.5],
        gears: { 1: [-0.5, -1], 2: [-0.5, 1], 3: [0.5, -1], 4: [0.5, 1], 5: [0.5, 1] },
        reverse: [-1.5, -1],
    },
};
const NEUTRAL = [0, 0];
/** Knob speed along the gate, in gate units per second. */
export const KNOB_TRAVEL = 9;

/** Knob position for `gear` in a gate (neutral sits on the rail between columns). */
export function gatePosition(gate, gear) {
    if (gear === REVERSE) return gate.reverse;
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
