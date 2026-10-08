import { linearGradient, radialGradient } from '../util/canvas.js';
import { shadeHex } from '../util/color.js';
import { TAU, moveTowards } from '../util/math.js';
import { LAYOUT } from './layout.js';

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
const TRAVEL = 9;

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

/** The animated H-pattern gear lever (open chrome gate or leather boot). */
export class GearLever {
    constructor(car) {
        this.style = car.cockpit.shifter;
        this.gate = GATES[this.style.pattern];
        this.knob = [...NEUTRAL];
    }

    update(dt, gear) {
        this.knob = stepKnob(this.knob, gatePosition(this.gate, gear), TRAVEL * dt);
    }

    draw(ctx) {
        const l = LAYOUT.lever;
        if (this.style.type === 'gate') this._plate(ctx, l);
        else this._boot(ctx, l);
        const kx = l.x + this.knob[0] * l.col;
        const ky = l.y + this.knob[1] * l.row - 26;
        ctx.strokeStyle = linearGradient(ctx, kx - 5, 0, kx + 5, 0, [
            [0, '#4a4c50'],
            [0.5, '#d6d9de'],
            [1, '#3b3d41'],
        ]);
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(l.x + this.knob[0] * l.col * 0.4, l.y + 30);
        ctx.lineTo(kx, ky);
        ctx.stroke();
        const r = 21 - this.knob[1] * 1.5;
        ctx.fillStyle = radialGradient(ctx, kx - r * 0.35, ky - r * 0.4, r * 0.1, r * 1.1, [
            [0, shadeHex(this.style.knob, 3)],
            [0.35, this.style.knob],
            [1, '#000000'],
        ]);
        ctx.beginPath();
        ctx.arc(kx, ky, r, 0, TAU);
        ctx.fill();
    }

    _plate(ctx, l) {
        ctx.fillStyle = linearGradient(
            ctx,
            l.x - l.plateW / 2,
            l.y - l.plateH / 2,
            l.x + l.plateW / 2,
            l.y + l.plateH / 2,
            [
                [0, '#f1f3f6'],
                [0.5, '#8d9299'],
                [1, '#dfe2e6'],
            ],
        );
        ctx.beginPath();
        ctx.roundRect(l.x - l.plateW / 2, l.y - l.plateH / 2, l.plateW, l.plateH, 10);
        ctx.fill();
        ctx.strokeStyle = '#141416';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        const { columns } = this.gate;
        ctx.beginPath();
        ctx.moveTo(l.x + columns[0] * l.col, l.y);
        ctx.lineTo(l.x + columns.at(-1) * l.col, l.y);
        for (const column of columns) {
            ctx.moveTo(l.x + column * l.col, l.y - l.row);
            ctx.lineTo(l.x + column * l.col, l.y + l.row);
        }
        ctx.stroke();
    }

    _boot(ctx, l) {
        ctx.fillStyle = radialGradient(ctx, l.x, l.y, 8, l.plateW * 0.55, [
            [0, '#2b2b2d'],
            [1, '#09090a'],
        ]);
        ctx.beginPath();
        ctx.ellipse(l.x, l.y, l.plateW * 0.5, l.plateH * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 2;
        for (let a = 0; a < TAU; a += TAU / 12) {
            ctx.beginPath();
            ctx.moveTo(l.x + Math.cos(a) * 14, l.y + Math.sin(a) * 12);
            ctx.lineTo(l.x + Math.cos(a) * l.plateW * 0.46, l.y + Math.sin(a) * l.plateH * 0.46);
            ctx.stroke();
        }
    }
}
