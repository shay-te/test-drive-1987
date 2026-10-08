import { VIEW } from '../../config.js';
import { STAGES } from '../../data/stages.js';
import { t } from '../../i18n/i18n.js';
import { linearGradient } from '../../util/canvas.js';
import { formatClock } from '../../util/format.js';
import { clamp } from '../../util/math.js';
import { drawCarArt } from '../CarArt.js';
import { paintScenery } from '../scenery.js';
import { COLORS, font } from '../theme.js';
import { drawPanel, drawPrompt, drawText } from '../widgets.js';

const HORIZON = 430;
const FILL_SECONDS = 3;
const CANOPY = { x: 120, y: 190, w: 700, h: 46, posts: [160, 760], ground: 640 };
const PUMPS = [300, 560];
const PANEL = { x: 860, y: 230, w: 380, h: 330, row: 44 };
const FUEL_BAR = { x: 890, y: 500, w: 320, h: 22 };

/** Midday in the hills, at the pumps. */
const DAY = {
    sky: [
        [0, '#3f7fd0'],
        [1, '#cfe3f5'],
    ],
    sun: { x: 980, y: 90, r: 160, color: 'rgba(255,250,225,0.9)' },
    ranges: [
        { color: '#8ea3b8', base: HORIZON - 30, height: 150, scale: 0.004 },
        { color: '#6e7f63', base: HORIZON, height: 110, scale: 0.007 },
        { color: '#4c5b3f', base: HORIZON + 40, height: 70, scale: 0.012 },
    ],
    ground: '#55524c',
    groundY: HORIZON + 80,
};

/** The gas station between stages: the stage sheet while the tank fills, then on up the mountain. */
export class StationScreen {
    constructor({ game, display, resources, audio, input }) {
        Object.assign(this, { game, display, resources, audio, input });
        this.time = 0;
        this.full = false;
    }

    enter({ session, result }) {
        this.session = session;
        this.result = result;
        this.audio.play('pump', { volume: 0.7 });
    }

    update(dt) {
        this.time += dt;
        if (!this.full && this.time >= FILL_SECONDS) {
            this.full = true;
            this.audio.play('ding', { bus: 'ui' });
        }
        if (this.full && this.input.pressed('confirm')) {
            this.session.advance();
            this.game.go('drive', { session: this.session });
        }
    }

    render(ctx) {
        const car = this.session.car;
        const scene = this.resources.scaledCanvas(
            `station:${car.id}`,
            VIEW.width,
            VIEW.height,
            this.display.scale,
            (c) => {
                paintScenery(c, DAY, HORIZON);
                paintStation(c);
                drawCarArt(c, car, 250, CANOPY.ground, 420);
            },
        );
        ctx.drawImage(scene, 0, 0, VIEW.width, VIEW.height);
        this._sheet(ctx);
    }

    _sheet(ctx) {
        const r = this.result;
        const p = PANEL;
        drawPanel(ctx, p.x, p.y, p.w, p.h);
        drawText(ctx, t('station.heading', { n: r.stage + 1 }), p.x + p.w / 2, p.y + 36, {
            size: 26,
            family: 'display',
            color: COLORS.accent,
        });
        const rows = [
            [t('station.stageTime'), formatClock(r.time)],
            [t('station.averageSpeed'), `${r.avgMph.toFixed(1)} ${t('general.mph')}`],
            [t('station.tickets'), String(r.tickets)],
            [t('station.crashes'), String(r.crashes)],
            [t('general.points'), String(r.points)],
        ];
        rows.forEach(([label, value], i) => {
            const y = p.y + 84 + i * p.row * 0.8;
            drawText(ctx, label, p.x + 26, y, { size: 18, color: COLORS.chrome, align: 'left' });
            drawText(ctx, value, p.x + p.w - 26, y, { size: 18, weight: 'bold', align: 'right' });
        });
        const fill = clamp(this.time / FILL_SECONDS, 0, 1);
        const b = FUEL_BAR;
        ctx.fillStyle = COLORS.lcdDim;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = COLORS.lcd;
        ctx.fillRect(b.x, b.y, b.w * fill, b.h);
        drawText(ctx, this.full ? t('general.fuel') : t('station.refuelling'), b.x + b.w / 2, b.y - 16, {
            size: 15,
            color: COLORS.chrome,
        });
        if (this.full) {
            const next = STAGES[r.stage + 1];
            drawText(ctx, next.name, VIEW.width / 2, VIEW.height - 110, { size: 22, weight: 'bold' });
            drawPrompt(ctx, t('station.continue'), this.time, VIEW.height - 64);
        }
    }
}

/** Canopy on its posts, the GAS sign and two pumps, on the forecourt. */
function paintStation(ctx) {
    const c = CANOPY;
    ctx.fillStyle = '#3a3936';
    ctx.fillRect(0, c.ground - 30, VIEW.width, VIEW.height - c.ground + 30);
    ctx.fillStyle = '#d7d3c8';
    for (const x of c.posts) ctx.fillRect(x - 9, c.y + c.h, 18, c.ground - c.y - c.h);
    ctx.fillStyle = linearGradient(ctx, 0, c.y, 0, c.y + c.h, [
        [0, '#f4f1ea'],
        [1, '#bdb8ac'],
    ]);
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(c.x, c.y + c.h - 10, c.w, 10);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(c.x + c.w / 2 - 70, c.y - 70, 140, 64);
    ctx.font = font(44, 'display');
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('station.sign'), c.x + c.w / 2, c.y - 38);
    for (const x of PUMPS) {
        ctx.fillStyle = '#ece8de';
        ctx.fillRect(x - 26, c.ground - 150, 52, 150);
        ctx.fillStyle = COLORS.danger;
        ctx.fillRect(x - 26, c.ground - 150, 52, 26);
        ctx.fillStyle = '#1b1b1d';
        ctx.fillRect(x - 18, c.ground - 112, 36, 30);
        ctx.fillStyle = COLORS.lcd;
        ctx.fillRect(x - 14, c.ground - 106, 28, 8);
    }
}
