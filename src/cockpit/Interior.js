import { VIEW } from '../config.js';
import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import {
    fillPolygon,
    linearGradient,
    radialGradient,
    roundedTrapezoidPath,
    speckle,
} from '../util/canvas.js';
import { shadeHex } from '../util/color.js';
import { TAU } from '../util/math.js';
import { drawDialFace, drawGlass } from './Gauges.js';
import { DEFAULT_MIRROR, DEFAULT_PARTS, LAYOUT } from './layout.js';

const GRAIN = { leather: 9000, vinyl: 6000, plastic: 3500 };
const FABRIC = '#2b2c30';
const CHROME = [
    [0, '#eef1f4'],
    [0.5, '#7d828a'],
    [1, '#d5d9de'],
];

/** Paints the static parts of a car's interior into cached layers (logical coordinates). */
export class Interior {
    constructor(car, cluster) {
        this.trim = car.cockpit.dash;
        this.cluster = cluster;
        this.parts = { ...DEFAULT_PARTS, ...car.cockpit.layout };
        this.mirror = { ...DEFAULT_MIRROR, ...car.cockpit.mirror };
    }

    /** Where the trip computer text goes: its own LCD, or the radio display. */
    get tripRect() {
        return this.parts.center === 'radio' ? LAYOUT.radio.display : LAYOUT.trip;
    }

    /** Headliner, A-pillars, sun visor with the radar detector, and the mirror (glass left clear). */
    drawTop(ctx) {
        const { headliner } = LAYOUT;
        ctx.fillStyle = linearGradient(ctx, 0, 0, 0, headliner.h, [
            [0, shadeHex(FABRIC, 0.8)],
            [1, FABRIC],
        ]);
        ctx.fillRect(0, 0, VIEW.width, headliner.h);
        speckle(ctx, VIEW.width, headliner.h, { count: 2500, alpha: 0.12, seed: 21 });
        ctx.fillStyle = '#0b0b0c';
        ctx.fillRect(0, headliner.h - 6, VIEW.width, 7);
        if (this.parts.pillars) this._pillars(ctx);
        this._visor(ctx);
        this._mirror(ctx);
    }

    /** Dash, cowl, cluster housing, dial faces and the car's own controls and vents. */
    drawDash(ctx) {
        const { dash, rightPanel } = LAYOUT;
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
        if (this.parts.right === 'grille') {
            ctx.fillStyle = trim.panel;
            ctx.fillRect(rightPanel.x, dash.faceTop + 4, VIEW.width - rightPanel.x, bottom - dash.faceTop);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(rightPanel.x - 2, dash.faceTop + 4, 3, bottom - dash.faceTop);
        }
        speckle(ctx, VIEW.width, bottom, { count: GRAIN[trim.grain], alpha: 0.08, seed: 33 });

        this._cowl(ctx, this.parts.cowl, trim);
        this._housing(ctx);
        const part = {
            vent: this._roundVent,
            ignition: this._ignition,
            grille: this._grille,
            glovebox: this._glovebox,
        };
        part[this.parts.left].call(this, ctx);
        part[this.parts.right].call(this, ctx);
        if (this.parts.center === 'radio') this._radio(ctx);
        else this._tripBezel(ctx);
        this._hazard(ctx);
        for (const item of this.cluster.instruments) {
            if (item.type === 'dial') drawDialFace(ctx, item);
            if (item.type === 'text') this._label(ctx, item);
        }
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

    _pillars(ctx) {
        const { pillars } = LAYOUT;
        for (const side of [pillars.left, pillars.right]) {
            const x0 = Math.min(
                ...side.map((p) => {
                    return p[0];
                }),
            );
            const x1 = Math.max(
                ...side.map((p) => {
                    return p[0];
                }),
            );
            ctx.fillStyle = linearGradient(ctx, x0, 0, x1, 0, [
                [0, '#1c1c1e'],
                [0.6, '#3a3b3f'],
                [1, '#121213'],
            ]);
            fillPolygon(ctx, side);
        }
    }

    _visor(ctx) {
        const { visor, radar } = LAYOUT;
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
    }

    /** Mirror housing on its stem; the glass is cut out so the 3D rear view shows through. */
    _mirror(ctx) {
        const m = VIEW.mirror;
        const s = this.mirror;
        const b = s.bezel;
        const stem = LAYOUT.mirror;
        ctx.fillStyle = '#121213';
        ctx.fillRect(
            stem.stemX - stem.stemW / 2,
            LAYOUT.headliner.h - 8,
            stem.stemW,
            m.y - LAYOUT.headliner.h + 8,
        );
        ctx.fillStyle = radialGradient(ctx, stem.stemX - 3, m.y - b - 3, 1, 12, [
            [0, '#5a5b5f'],
            [1, '#111112'],
        ]);
        ctx.beginPath();
        ctx.arc(stem.stemX, m.y - b + 2, 11, 0, TAU);
        ctx.fill();

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = linearGradient(ctx, 0, m.y - b, 0, m.y + m.h + b, [
            [0, '#36373b'],
            [0.5, '#1a1a1c'],
            [1, '#0a0a0b'],
        ]);
        roundedTrapezoidPath(ctx, m.x - b, m.y - b, m.w + 2 * b, m.h + 2 * b, s.housingRadius, s.taper);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.5;
        roundedTrapezoidPath(
            ctx,
            m.x - b + 1,
            m.y - b + 1,
            m.w + 2 * b - 2,
            m.h + 2 * b - 2,
            s.housingRadius,
            s.taper,
        );
        ctx.stroke();
        if (s.tab) {
            ctx.fillStyle = '#0d0d0e';
            ctx.beginPath();
            ctx.roundRect(m.x + m.w / 2 - 15, m.y + m.h + b - 3, 30, 11, 4);
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'destination-out';
        roundedTrapezoidPath(ctx, m.x, m.y, m.w, m.h, s.radius, s.taper * 0.6);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = linearGradient(ctx, m.x, m.y, m.x + m.w * 0.6, m.y + m.h, [
            [0, 'rgba(255,255,255,0.10)'],
            [0.5, 'rgba(255,255,255,0.02)'],
            [1, 'rgba(255,255,255,0)'],
        ]);
        roundedTrapezoidPath(ctx, m.x, m.y, m.w, m.h, s.radius, s.taper * 0.6);
        ctx.fill();
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

    _grille(ctx) {
        const { vent } = LAYOUT;
        ctx.fillStyle = '#0a0a0b';
        ctx.beginPath();
        ctx.roundRect(vent.x, vent.y, vent.w + 20, vent.h + 20, 10);
        ctx.fill();
        for (let x = vent.x + 10; x < vent.x + vent.w; x += vent.slat) {
            ctx.fillStyle = linearGradient(ctx, x, 0, x + vent.slat * 0.55, 0, [
                [0, shadeHex(this.trim.panel, 0.55)],
                [0.5, shadeHex(this.trim.panel, 1.1)],
                [1, shadeHex(this.trim.panel, 0.4)],
            ]);
            ctx.fillRect(x, vent.y + 8, vent.slat * 0.55, vent.h);
        }
    }

    _roundVent(ctx) {
        const { roundVent } = LAYOUT;
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

    /** Key on the left of the column (Le Mans start) and the rotary light switch above it. */
    _ignition(ctx) {
        const { ignition, lightSwitch } = LAYOUT;
        for (const knob of [lightSwitch, ignition]) {
            ctx.fillStyle = linearGradient(
                ctx,
                knob.x - knob.r,
                knob.y - knob.r,
                knob.x + knob.r,
                knob.y + knob.r,
                CHROME,
            );
            ctx.beginPath();
            ctx.arc(knob.x, knob.y, knob.r, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#0e0e0f';
            ctx.beginPath();
            ctx.arc(knob.x, knob.y, knob.r - 5, 0, TAU);
            ctx.fill();
        }
        ctx.fillStyle = '#c9cdd3';
        ctx.fillRect(ignition.x - 3, ignition.y - 12, 6, 24);
        ctx.fillStyle = '#26211c';
        ctx.beginPath();
        ctx.roundRect(ignition.x - 13, ignition.y + 14, 26, 46, 9);
        ctx.fill();
        ctx.fillStyle = '#d0d3d8';
        ctx.fillRect(lightSwitch.x - 2, lightSwitch.y - 9, 4, 18);
    }

    /** Period radio in the centre stack (its display hosts the trip computer) and climate panel. */
    _radio(ctx) {
        const { radio, climate } = LAYOUT;
        ctx.fillStyle = '#0b0b0c';
        ctx.beginPath();
        ctx.roundRect(radio.x - 10, radio.y - 10, radio.w + 20, climate.y + climate.h - radio.y + 20, 8);
        ctx.fill();
        ctx.fillStyle = linearGradient(ctx, 0, radio.y, 0, radio.y + radio.h, [
            [0, '#2b2c30'],
            [1, '#151517'],
        ]);
        ctx.fillRect(radio.x, radio.y, radio.w, radio.h);
        ctx.strokeStyle = 'rgba(220,225,230,0.35)';
        ctx.strokeRect(radio.x + 1.5, radio.y + 1.5, radio.w - 3, radio.h - 3);
        const d = radio.display;
        ctx.fillStyle = radialGradient(ctx, d.x + d.w / 2, d.y, 8, d.w, [
            [0, '#1f2a22'],
            [1, '#0d130f'],
        ]);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        for (const x of [radio.x + 22, radio.x + radio.w - 22]) {
            ctx.fillStyle = linearGradient(ctx, x - 14, 0, x + 14, 0, CHROME);
            ctx.beginPath();
            ctx.arc(x, radio.y + radio.h / 2 - 10, 14, 0, TAU);
            ctx.fill();
        }
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = '#3b3c40';
            ctx.fillRect(d.x + 4 + i * (d.w / 5), d.y + d.h + 10, d.w / 5 - 8, 12);
        }

        ctx.fillStyle = '#121214';
        ctx.fillRect(climate.x, climate.y, climate.w, climate.h);
        for (let i = 0; i < 3; i++) {
            const y = climate.y + 18 + i * 24;
            ctx.fillStyle = '#050505';
            ctx.fillRect(climate.x + 30, y - 2, climate.w - 60, 4);
            ctx.fillStyle = '#c3c7cc';
            ctx.fillRect(climate.x + 40 + ((i * 53) % (climate.w - 90)), y - 7, 10, 14);
        }
    }

    _glovebox(ctx) {
        const { glovebox } = LAYOUT;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(glovebox.x, glovebox.y, glovebox.w, glovebox.h, 12);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(glovebox.x + 2, glovebox.y + 3, glovebox.w, glovebox.h, 12);
        ctx.stroke();
        ctx.fillStyle = linearGradient(ctx, glovebox.x + 20, 0, glovebox.x + 44, 0, CHROME);
        ctx.beginPath();
        ctx.roundRect(glovebox.x + 20, glovebox.y + 24, 24, 12, 4);
        ctx.fill();
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

    _label(ctx, item) {
        ctx.fillStyle = item.color;
        ctx.font = font(item.size, 'mono', 'bold');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(item.text, item.x, item.y);
    }
}
