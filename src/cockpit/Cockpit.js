import { VIEW } from '../config.js';
import { t } from '../i18n/i18n.js';
import { COLORS, font } from '../ui/theme.js';
import { formatClock, formatMiles } from '../util/format.js';
import { TAU } from '../util/math.js';
import { CLUSTERS } from './clusters.js';
import { drawBarGraph, drawDigits, drawLamp, drawNeedle } from './Gauges.js';
import { GearLever } from './GearLever.js';
import { Interior } from './Interior.js';
import { formatReading, NeedleSpring } from './instruments.js';
import { LAYOUT } from './layout.js';
import { SteeringWheel } from './SteeringWheel.js';
import { drawCrack } from './Windshield.js';

const LED_BLINK_HZ = 6;

/** Draws the driver's view of one car's interior over the 3D world, from a per-frame `view`. */
export class Cockpit {
    constructor(resources, display, car) {
        this.resources = resources;
        this.display = display;
        this.car = car;
        this.cluster = CLUSTERS[car.cockpit.cluster];
        this.interior = new Interior(car, this.cluster);
        this.wheel = new SteeringWheel(car);
        this.lever = new GearLever(car);
        this.needles = new Map(
            this.cluster.instruments.map((item) => {
                return [item, new NeedleSpring()];
            }),
        );
        this.view = null;
    }

    /** `view` = {readings, lamps, steer, gear, gearLabel, radar, trip, showLever, digital, crack, time}. */
    update(dt, view) {
        for (const [item, spring] of this.needles) spring.update(view.readings[item.source] ?? 0, dt);
        this.lever.update(dt, view.gear);
        this.view = view;
    }

    render(ctx) {
        const view = this.view;
        if (!view) return;
        if (view.crack)
            this._drawLayer(ctx, `crack:${view.crack.seed}`, VIEW.width, VIEW.windshieldBottom, 0, 0, (c) => {
                drawCrack(c, view.crack);
            });
        this._drawLayer(ctx, 'top', VIEW.width, VIEW.height, 0, 0, (c) => {
            this.interior.drawTop(c);
        });
        this._drawLayer(ctx, 'dash', VIEW.width, VIEW.height, 0, 0, (c) => {
            this.interior.drawDash(c);
        });
        this._instruments(ctx, view);
        this._drawLayer(ctx, 'glass', VIEW.width, VIEW.height, 0, 0, (c) => {
            this.interior.drawGlass(c);
        });
        this._radar(ctx, view);
        this._trip(ctx, view);
        if (view.showLever) this.lever.draw(ctx);
        const size = this.wheel.size;
        const sprite = this._layer('wheel', size, size, (c) => {
            this.wheel.drawSprite(c);
        });
        this.wheel.draw(ctx, sprite, view.steer);
    }

    /** A static layer painted once per car and resolution, cached by the ResourceManager. */
    _layer(name, width, height, paint) {
        const scale = this.display.scale;
        return this.resources.canvas(
            `cockpit:${this.car.id}:${name}:${scale}`,
            width * scale,
            height * scale,
            (c) => {
                c.scale(scale, scale);
                paint(c);
            },
        );
    }

    _drawLayer(ctx, name, width, height, x, y, paint) {
        ctx.drawImage(this._layer(name, width, height, paint), x, y, width, height);
    }

    _instruments(ctx, view) {
        for (const item of this.cluster.instruments) {
            const value = this.needles.get(item).value;
            if (item.type === 'dial') drawNeedle(ctx, item, value);
            if (item.type === 'bar') drawBarGraph(ctx, item, value / item.max);
            if (item.type === 'digits')
                drawDigits(ctx, item, formatReading(item.format, view.readings[item.source]));
        }
        for (const lamp of this.cluster.lamps) drawLamp(ctx, lamp, view.lamps[lamp.source]);
    }

    _radar(ctx, view) {
        const r = LAYOUT.radar;
        const lit = Math.ceil(view.radar * r.leds);
        const blinkOff = view.radar > 0.85 && Math.floor(view.time * LED_BLINK_HZ) % 2 === 1;
        drawLamp(ctx, { x: r.x + 16, y: r.ledY, r: 4, color: COLORS.lcd }, true);
        for (let i = 0; i < lit && !blinkOff; i++) {
            drawLamp(ctx, { x: r.ledX + i * r.ledGap, y: r.ledY, r: 5, color: COLORS.led }, true);
        }
    }

    _trip(ctx, view) {
        const trip = this.interior.tripRect;
        const k = trip.h / LAYOUT.trip.h;
        const info = view.trip;
        const left = trip.x + 14 * k;
        const right = trip.x + trip.w - 14 * k;
        ctx.save();
        ctx.fillStyle = COLORS.lcd;
        ctx.shadowColor = COLORS.lcd;
        ctx.shadowBlur = 6;
        ctx.font = font(17 * k, 'mono', 'bold');
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(t('trip.stage', { n: info.stage, total: info.total }), left, trip.y + 26 * k);
        ctx.fillText(
            t(info.summit ? 'trip.toSummit' : 'trip.toGas', { mi: formatMiles(info.remaining) }),
            left,
            trip.y + 52 * k,
        );
        ctx.textAlign = 'right';
        ctx.fillText(formatClock(info.elapsed), right, trip.y + 26 * k);
        ctx.textAlign = 'left';
        if (view.digital) {
            // The digital readout (I key) takes the bottom line in place of the chances.
            const r = view.readings;
            const readout = `${Math.round(r.speed)} ${t('general.mph')} ${Math.round(r.rpm * 1000)} ${t('general.rpm')} ${view.gearLabel}`;
            ctx.fillText(readout, left, trip.y + 88 * k);
        } else {
            ctx.font = font(12 * k, 'mono', 'bold');
            ctx.fillText(t('general.chances'), left, trip.y + 88 * k);
            for (let i = 0; i < info.maxChances; i++) {
                ctx.globalAlpha = i < info.chances ? 1 : 0.15;
                ctx.beginPath();
                ctx.arc(left + (96 + i * 20) * k, trip.y + 84 * k, 6 * k, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}
