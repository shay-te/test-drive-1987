import { VIEW } from '../config.js';
import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import { linearGradient, radialGradient, speckle } from '../util/canvas.js';
import { shadeHex } from '../util/color.js';
import { TAU } from '../util/math.js';
import { drawDialFace, drawGlass } from './Gauges.js';
import { LAYOUT } from './layout.js';

const GRAIN = { leather: 9000, vinyl: 6000, plastic: 3500 };
const FABRIC = '#2b2c30';

/** Paints the static parts of a car's interior into cached layers (logical coordinates). */
export class Interior {
    constructor(car, cluster) {
        this.car = car;
        this.trim = car.cockpit.dash;
        this.cluster = cluster;
    }

    /** Headliner, sun visor with the radar detector, and the mirror frame (glass left clear). */
    drawTop(ctx) {
        const { headliner, visor, radar, mirror } = LAYOUT;
        ctx.fillStyle = linearGradient(ctx, 0, 0, 0, headliner.h, [
            [0, shadeHex(FABRIC, 0.8)],
            [1, FABRIC],
        ]);
        ctx.fillRect(0, 0, VIEW.width, headliner.h);
        speckle(ctx, VIEW.width, headliner.h, { count: 2500, alpha: 0.12, seed: 21 });
        ctx.fillStyle = '#0b0b0c';
        ctx.fillRect(0, headliner.h - 6, VIEW.width, 7);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = linearGradient(ctx, 0, visor.y, 0, visor.y + visor.h, [
            [0, shadeHex(FABRIC, 1.15)],
            [1, shadeHex(FABRIC, 0.85)],
        ]);
        ctx.beginPath();
        ctx.roundRect(visor.x, visor.y, visor.w, visor.h, visor.r);
        ctx.fill();
        ctx.restore();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.roundRect(visor.x + 9, visor.y + 9, visor.w - 18, visor.h - 18, visor.r - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#7d7f84';
        ctx.fillRect(radar.x + radar.w / 2 - 9, radar.y - 10, 18, 14);
        ctx.fillStyle = linearGradient(ctx, 0, radar.y, 0, radar.y + radar.h, [
            [0, '#26272a'],
            [1, '#0c0c0d'],
        ]);
        ctx.beginPath();
        ctx.roundRect(radar.x, radar.y, radar.w, radar.h, 9);
        ctx.fill();
        ctx.fillStyle = '#c9cbd0';
        ctx.font = font(13, 'display');
        ctx.textBaseline = 'middle';
        ctx.fillText(t('general.radar'), radar.x + 34, radar.y + 18);
        for (let i = 0; i < radar.leds; i++) {
            ctx.fillStyle = '#200606';
            ctx.beginPath();
            ctx.arc(radar.ledX + i * radar.ledGap, radar.ledY, 5, 0, TAU);
            ctx.fill();
        }

        const m = VIEW.mirror;
        ctx.fillStyle = '#121213';
        ctx.fillRect(mirror.stemX - mirror.stemW / 2, headliner.h - 8, mirror.stemW, m.y - headliner.h + 12);
        ctx.fillStyle = linearGradient(ctx, 0, m.y - mirror.bezel, 0, m.y + m.h + mirror.bezel, [
            [0, '#2c2d30'],
            [1, '#0d0d0e'],
        ]);
        ctx.beginPath();
        ctx.roundRect(
            m.x - mirror.bezel,
            m.y - mirror.bezel,
            m.w + 2 * mirror.bezel,
            m.h + 2 * mirror.bezel,
            14,
        );
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.roundRect(m.x, m.y, m.w, m.h, 6);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    /** Dash, cowl, vents, trip-computer bezel, cluster housing and every dial face. */
    drawDash(ctx) {
        const { dash, cowl, rightPanel } = LAYOUT;
        const trim = this.trim;
        const bottom = VIEW.height;

        ctx.fillStyle = linearGradient(ctx, 0, dash.top, 0, dash.faceTop, [
            [0, shadeHex(trim.top, 1.25)],
            [1, trim.top],
        ]);
        ctx.fillRect(0, dash.top, VIEW.width, dash.faceTop - dash.top + 2);
        ctx.fillStyle = linearGradient(ctx, 0, dash.faceTop, 0, bottom, [
            [0, shadeHex(trim.face, 1.08)],
            [1, shadeHex(trim.face, 0.72)],
        ]);
        ctx.fillRect(0, dash.faceTop, VIEW.width, bottom - dash.faceTop);
        ctx.fillStyle = trim.panel;
        ctx.fillRect(rightPanel.x, dash.faceTop + 4, VIEW.width - rightPanel.x, bottom - dash.faceTop);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(rightPanel.x - 2, dash.faceTop + 4, 3, bottom - dash.faceTop);
        speckle(ctx, VIEW.width, bottom, { count: GRAIN[trim.grain], alpha: 0.08, seed: 33 });

        this._cowl(ctx, cowl, trim);
        this._housing(ctx);
        this._vents(ctx, trim);
        this._tripBezel(ctx);
        this._hazard(ctx);
        for (const item of this.cluster.instruments) {
            if (item.type === 'dial') drawDialFace(ctx, item);
            if (item.type === 'text') this._label(ctx, item);
        }
    }

    _label(ctx, item) {
        ctx.fillStyle = item.color;
        ctx.font = font(item.size, 'mono', 'bold');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(item.text, item.x, item.y);
    }

    /** Dial glass and the cowl's shadow, laid over the needles. */
    drawGlass(ctx) {
        const h = this.cluster.housing;
        ctx.fillStyle = linearGradient(ctx, 0, h.y, 0, h.y + 60, [
            [0, 'rgba(0,0,0,0.55)'],
            [1, 'rgba(0,0,0,0)'],
        ]);
        ctx.fillRect(h.x, h.y, h.w, 60);
        for (const item of this.cluster.instruments) {
            if (item.type === 'dial') drawGlass(ctx, item);
        }
    }

    _cowl(ctx, cowl, trim) {
        const mid = (cowl.x0 + cowl.x1) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = linearGradient(ctx, 0, cowl.peak, 0, cowl.lip, [
            [0, shadeHex(trim.top, 1.35)],
            [0.4, trim.top],
            [1, shadeHex(trim.top, 0.55)],
        ]);
        ctx.beginPath();
        ctx.moveTo(cowl.x0 - 30, LAYOUT.dash.top + 6);
        ctx.quadraticCurveTo(cowl.x0, cowl.peak + 6, mid, cowl.peak);
        ctx.quadraticCurveTo(cowl.x1, cowl.peak + 6, cowl.x1 + 30, LAYOUT.dash.top + 6);
        ctx.lineTo(cowl.x1 + 10, cowl.lip);
        ctx.quadraticCurveTo(mid, cowl.lip + 14, cowl.x0 - 10, cowl.lip);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cowl.x0 - 26, LAYOUT.dash.top + 6);
        ctx.quadraticCurveTo(cowl.x0, cowl.peak + 7, mid, cowl.peak + 1);
        ctx.quadraticCurveTo(cowl.x1, cowl.peak + 7, cowl.x1 + 26, LAYOUT.dash.top + 6);
        ctx.stroke();
    }

    _housing(ctx) {
        const h = this.cluster.housing;
        ctx.fillStyle = linearGradient(ctx, 0, h.y, 0, h.y + h.h, [
            [0, '#060606'],
            [1, '#17171a'],
        ]);
        ctx.beginPath();
        ctx.roundRect(h.x, h.y, h.w, h.h, h.r);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _vents(ctx, trim) {
        const { vent, roundVent } = LAYOUT;
        ctx.fillStyle = '#0a0a0b';
        ctx.beginPath();
        ctx.roundRect(vent.x, vent.y, vent.w + 20, vent.h + 20, 10);
        ctx.fill();
        for (let x = vent.x + 10; x < vent.x + vent.w; x += vent.slat) {
            ctx.fillStyle = linearGradient(ctx, x, 0, x + vent.slat * 0.55, 0, [
                [0, shadeHex(trim.panel, 0.55)],
                [0.5, shadeHex(trim.panel, 1.1)],
                [1, shadeHex(trim.panel, 0.4)],
            ]);
            ctx.fillRect(x, vent.y + 8, vent.slat * 0.55, vent.h);
        }

        ctx.fillStyle = linearGradient(ctx, roundVent.x - roundVent.r, 0, roundVent.x + roundVent.r, 0, [
            [0, '#d9dce1'],
            [1, '#6b6f75'],
        ]);
        ctx.beginPath();
        ctx.arc(roundVent.x, roundVent.y, roundVent.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#0c0c0d';
        ctx.beginPath();
        ctx.arc(roundVent.x, roundVent.y, roundVent.r - 7, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#3a3b3e';
        ctx.lineWidth = 4;
        for (let dy = -28; dy <= 28; dy += 11) {
            ctx.beginPath();
            ctx.moveTo(roundVent.x - 36, roundVent.y + dy);
            ctx.lineTo(roundVent.x + 36, roundVent.y + dy);
            ctx.stroke();
        }
    }

    _tripBezel(ctx) {
        const { trip } = LAYOUT;
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.roundRect(trip.x - 8, trip.y - 8, trip.w + 16, trip.h + 16, 12);
        ctx.fill();
        ctx.fillStyle = radialGradient(ctx, trip.x + trip.w / 2, trip.y, 10, trip.w, [
            [0, '#1f2a22'],
            [1, '#0d130f'],
        ]);
        ctx.fillRect(trip.x, trip.y, trip.w, trip.h);
    }

    _hazard(ctx) {
        const { hazard } = LAYOUT;
        ctx.fillStyle = '#1b1b1c';
        ctx.beginPath();
        ctx.roundRect(hazard.x - hazard.r, hazard.y - hazard.r, hazard.r * 2, hazard.r * 2, 4);
        ctx.fill();
        ctx.fillStyle = '#c4271c';
        ctx.beginPath();
        ctx.moveTo(hazard.x, hazard.y - 8);
        ctx.lineTo(hazard.x + 8, hazard.y + 6);
        ctx.lineTo(hazard.x - 8, hazard.y + 6);
        ctx.closePath();
        ctx.fill();
    }
}
