import { DEG, TAU } from '../util/math.js';
import { linearGradient, radialGradient } from '../util/canvas.js';
import { font } from '../ui/theme.js';
import { dialAngle } from './instruments.js';

/** Generic instrument drawing: dials, needles, LCD bars and digits, warning lamps.
 *  Specs are plain data ({x, y, r, min, max, ...}); nothing here knows which car it is. */

const BEZEL = {
    chrome: [
        [0, '#f4f6f8'],
        [0.45, '#8a9097'],
        [0.55, '#5d6268'],
        [1, '#dfe3e8'],
    ],
    black: [
        [0, '#3a3a3c'],
        [0.5, '#111112'],
        [1, '#2a2a2c'],
    ],
};

/** Static face of a round dial: well, bezel, face, ticks, numerals, red zone and label.
 *  A dial with `sharesFace` adds a second scale to the face drawn by the dial before it. */
export function drawDialFace(ctx, dial) {
    ctx.save();
    if (!dial.sharesFace) drawWell(ctx, dial);
    scale(ctx, dial);
    ctx.restore();
}

/** Recessed well, bezel ring and the face itself. */
function drawWell(ctx, dial) {
    const { x, y, r } = dial;
    ctx.fillStyle = radialGradient(ctx, x, y, r * 0.9, r * 1.22, [
        [0, 'rgba(0,0,0,0.9)'],
        [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = linearGradient(ctx, x - r, y - r, x + r, y + r, BEZEL[dial.bezel ?? 'black']);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.07, 0, TAU);
    ctx.fill();
    ctx.fillStyle = radialGradient(ctx, x, y - r * 0.3, r * 0.1, r * 1.1, [
        [0, dial.face ?? '#1a1a1c'],
        [1, '#050505'],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
}

/** Red zone, ticks, numerals and labels along the dial's sweep. */
function scale(ctx, dial) {
    const { x, y, r } = dial;
    if (dial.redFrom !== undefined) {
        ctx.strokeStyle = dial.redColor ?? '#d42a1e';
        ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        const from = dialAngle(dial, dial.redFrom) * DEG;
        ctx.arc(x, y, r * 0.86, from, dialAngle(dial, dial.max) * DEG, dial.endDeg < dial.startDeg);
        ctx.stroke();
    }

    ctx.strokeStyle = dial.ink ?? '#f2f2ec';
    ctx.lineCap = 'butt';
    for (let v = dial.min; v <= dial.max + 1e-6; v += dial.minorStep ?? dial.majorStep) {
        const major = Math.abs(v / dial.majorStep - Math.round(v / dial.majorStep)) < 1e-6;
        const a = dialAngle(dial, v) * DEG;
        const inner = r * (major ? 0.78 : 0.85);
        ctx.lineWidth = major ? r * 0.035 : r * 0.016;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93);
        ctx.stroke();
    }

    ctx.fillStyle = dial.numerals ?? dial.ink ?? '#f2f2ec';
    ctx.font = font(r * (dial.numeralScale ?? 0.17), 'gauge', 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelStep = dial.labelStep ?? dial.majorStep;
    for (let v = dial.labelFrom ?? dial.min; v <= dial.max + 1e-6; v += labelStep) {
        const a = dialAngle(dial, v) * DEG;
        const text = String(Math.round(v / (dial.labelDivisor ?? 1)));
        ctx.fillText(text, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    }
    const labelX = x + r * (dial.labelX ?? 0);
    if (dial.label) {
        ctx.fillStyle = dial.ink ?? '#f2f2ec';
        ctx.font = font(r * (dial.labelScale ?? 0.13), 'gauge', 'bold');
        ctx.fillText(dial.label, labelX, y + r * (dial.labelY ?? 0.4));
    }
    if (dial.sublabel) {
        ctx.font = font(r * 0.09, 'gauge');
        ctx.fillText(dial.sublabel, labelX, y + r * ((dial.labelY ?? 0.4) + 0.14));
    }
}

/** Needle with a soft drop shadow and a centre cap. */
export function drawNeedle(ctx, dial, value) {
    const { x, y, r } = dial;
    const a = dialAngle(dial, value) * DEG;
    const length = r * (dial.needleLength ?? 0.86);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = r * 0.06;
    ctx.shadowOffsetY = r * 0.03;
    ctx.fillStyle = dial.needle ?? '#f4f1e8';
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, -r * 0.035);
    ctx.lineTo(length, -r * 0.012);
    ctx.lineTo(length, r * 0.012);
    ctx.lineTo(-r * 0.16, r * 0.035);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = radialGradient(ctx, x - r * 0.03, y - r * 0.03, 0, r * 0.11, [
        [0, '#4a4a4c'],
        [1, '#0c0c0c'],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.1, 0, TAU);
    ctx.fill();
}

/** Curved reflection on the dial glass, drawn over the needle. */
export function drawGlass(ctx, dial) {
    if (dial.sharesFace) return;
    const { x, y, r } = dial;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = linearGradient(ctx, x, y - r, x, y + r * 0.2, [
        [0, 'rgba(255,255,255,0.16)'],
        [0.45, 'rgba(255,255,255,0.04)'],
        [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.15, y - r * 0.45, r * 0.95, r * 0.6, -0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
}

/** Segmented LCD bar graph along a straight or curved track; `value` in 0..1. */
export function drawBarGraph(ctx, bar, value) {
    const lit = Math.round(value * bar.segments);
    for (let i = 0; i < bar.segments; i++) {
        const f = i / (bar.segments - 1);
        const color = bar.colors.find(([limit]) => {
            return f <= limit;
        })[1];
        ctx.fillStyle = i < lit ? color : bar.ghost;
        const x = bar.x + f * bar.w;
        const rise = bar.curve ? Math.pow(f, 2) * bar.curve : 0;
        const height = bar.h * (0.45 + 0.55 * f);
        ctx.fillRect(x, bar.y - rise - height, (bar.w / bar.segments) * 0.62, height);
    }
}

/** Seven-segment style LCD digits with the faint unlit "8"s behind them. */
export function drawDigits(ctx, spec, text) {
    ctx.save();
    ctx.font = font(spec.size, 'mono', 'bold');
    ctx.textAlign = spec.align ?? 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = spec.ghost;
    ctx.fillText('8'.repeat(spec.width ?? text.length), spec.x, spec.y);
    ctx.fillStyle = spec.color;
    ctx.shadowColor = spec.color;
    ctx.shadowBlur = spec.size * 0.25;
    ctx.fillText(text.padStart(spec.width ?? text.length, ' '), spec.x, spec.y);
    ctx.restore();
}

/** A round warning lamp, glowing when on. */
export function drawLamp(ctx, lamp, on) {
    ctx.save();
    ctx.fillStyle = on ? lamp.color : '#1b1b1b';
    if (on) {
        ctx.shadowColor = lamp.color;
        ctx.shadowBlur = lamp.r * 2.5;
    }
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, lamp.r, 0, TAU);
    ctx.fill();
    ctx.restore();
}

/** A fixed legend printed on the cluster (e.g. "MPH" beside an LCD readout). */
export function drawLabel(ctx, label) {
    ctx.save();
    ctx.fillStyle = label.color;
    ctx.font = font(label.size, 'mono', 'bold');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.text, label.x, label.y);
    ctx.restore();
}
