import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import { linearGradient, radialGradient, speckle } from '../util/canvas.js';
import { shadeHex } from '../util/color.js';
import { DEG, TAU, clamp } from '../util/math.js';
import { LAYOUT } from './layout.js';

/** Spoke directions (canvas degrees, 0 = right, clockwise) by spoke count. */
const SPOKES = { 2: [-8, 188], 3: [-8, 188, 90], 4: [-24, 204, 62, 118] };
const MARKER = '#d0261c';
const PAD = 12;

/** The "TD" steering wheel: a sprite drawn once, rotated by the steering input every frame. */
export class SteeringWheel {
    constructor(car) {
        this.style = car.cockpit.wheel;
        this.size = (LAYOUT.wheel.outer + PAD) * 2;
    }

    /** Paints the wheel centred in a `size` x `size` sprite. */
    drawSprite(ctx) {
        const w = LAYOUT.wheel;
        const c = this.size / 2;
        ctx.save();
        ctx.translate(c, c);
        for (const angle of SPOKES[this.style.spokes]) this._spoke(ctx, angle * DEG);
        this._rim(ctx, w);
        this._hub(ctx, w);
        ctx.restore();
    }

    _rim(ctx, w) {
        const mid = (w.outer + w.inner) / 2;
        ctx.lineWidth = w.outer - w.inner;
        ctx.strokeStyle = radialGradient(ctx, 0, 0, w.inner, w.outer, [
            [0, '#050505'],
            [0.35, shadeHex(this.style.rim, 1.6)],
            [0.6, this.style.rim],
            [1, '#030303'],
        ]);
        ctx.beginPath();
        ctx.arc(0, 0, mid, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = MARKER;
        ctx.beginPath();
        ctx.arc(0, 0, mid, -Math.PI / 2 - 0.035, -Math.PI / 2 + 0.035);
        ctx.stroke();
        // Thumb grips at quarter-to-three.
        ctx.lineWidth = (w.outer - w.inner) * 1.15;
        ctx.strokeStyle = shadeHex(this.style.rim, 0.7);
        for (const a of [-12, 192]) {
            ctx.beginPath();
            ctx.arc(0, 0, mid, (a - 7) * DEG, (a + 7) * DEG);
            ctx.stroke();
        }
    }

    _spoke(ctx, angle) {
        const w = LAYOUT.wheel;
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = linearGradient(ctx, 0, -40, 0, 40, [
            [0, shadeHex(this.style.spoke, 1.5)],
            [0.5, this.style.spoke],
            [1, shadeHex(this.style.spoke, 0.5)],
        ]);
        ctx.beginPath();
        ctx.moveTo(w.hub * 0.6, -38);
        ctx.lineTo(w.inner + 6, -22);
        ctx.lineTo(w.inner + 6, 22);
        ctx.lineTo(w.hub * 0.6, 38);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    _hub(ctx, w) {
        ctx.fillStyle = radialGradient(ctx, -w.hub * 0.3, -w.hub * 0.4, w.hub * 0.1, w.hub * 1.4, [
            [0, '#3c3c3f'],
            [1, '#070707'],
        ]);
        ctx.beginPath();
        if (this.style.hub === 'pad') {
            // The big padded centre of the 1980s 911 four-spoke wheel.
            ctx.roundRect(-w.hub * 1.25, -w.hub * 0.85, w.hub * 2.5, w.hub * 1.75, w.hub * 0.5);
        } else {
            ctx.arc(0, 0, w.hub, 0, TAU);
        }
        ctx.fill();
        speckle(ctx, w.hub, w.hub, { count: 200, alpha: 0.08, seed: 4 });
        ctx.fillStyle = linearGradient(ctx, 0, -w.badge, 0, w.badge, [
            [0, '#e9ecf0'],
            [0.5, '#7b8088'],
            [1, '#c9cdd3'],
        ]);
        ctx.beginPath();
        ctx.arc(0, 0, w.badge, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#101012';
        ctx.beginPath();
        ctx.arc(0, 0, w.badge - 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e6e8ec';
        ctx.font = font(w.badge * 0.9, 'display');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('title.badge'), 0, 2);
    }

    /** Draws the cached sprite turned by `steer` (-1..1) plus a fixed sheen on the rim. */
    draw(ctx, sprite, steer) {
        const w = LAYOUT.wheel;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.save();
        ctx.rotate(clamp(steer, -1, 1) * w.maxTurnDeg * DEG);
        ctx.drawImage(sprite, -this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, w.outer - 10, -Math.PI * 0.85, -Math.PI * 0.35);
        ctx.stroke();
        ctx.restore();
    }
}
