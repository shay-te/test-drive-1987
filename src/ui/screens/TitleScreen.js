import { VIEW } from '../../config.js';
import { CARS } from '../../data/cars.js';
import { t } from '../../i18n/i18n.js';
import { clamp } from '../../util/math.js';
import { drawCarArt } from '../CarArt.js';
import { paintScenery } from '../scenery.js';
import { COLORS } from '../theme.js';
import { drawLogo, drawPrompt, drawText } from '../widgets.js';

const CAR_SECONDS = 3.5;
const ART_WIDTH = 560;
const HORIZON = 470;

/** Title: sunset over the mountains, the chrome logo and the five cars rolling by. */
export class TitleScreen {
    constructor({ game, display, resources, audio, input, world }) {
        Object.assign(this, { game, display, resources, audio, input, world });
        this.time = 0;
    }

    enter() {
        this.world.clear();
    }

    update(dt) {
        this.time += dt;
        if (this.input.pressed('confirm')) {
            this.audio.unlock().then(() => {
                this.audio.play('click', { bus: 'ui' });
            });
            this.game.go('select');
        }
    }

    render(ctx) {
        const scale = this.display.scale;
        const backdrop = this.resources.scaledCanvas(
            'title:backdrop',
            VIEW.width,
            VIEW.height,
            scale,
            (c) => {
                paintScenery(c, DUSK, HORIZON);
            },
        );
        ctx.drawImage(backdrop, 0, 0, VIEW.width, VIEW.height);
        drawLogo(ctx, t('title.logo'), VIEW.width / 2, 150, 132);
        drawText(ctx, t('title.tagline'), VIEW.width / 2, 245, { size: 24, color: COLORS.chrome });

        const index = Math.floor(this.time / CAR_SECONDS) % CARS.length;
        const phase = (this.time % CAR_SECONDS) / CAR_SECONDS;
        const car = CARS[index];
        const art = this.resources.scaledCanvas(
            `art:${car.id}:${ART_WIDTH}`,
            ART_WIDTH + 40,
            260,
            scale,
            (c) => {
                drawCarArt(c, car, 20, 230, ART_WIDTH);
            },
        );
        ctx.save();
        ctx.globalAlpha = clamp(Math.min(phase, 1 - phase) * 8, 0, 1);
        ctx.drawImage(art, (VIEW.width - ART_WIDTH) / 2 - 20, 360, ART_WIDTH + 40, 260);
        drawText(ctx, car.fullName, VIEW.width / 2, 640, { size: 22, weight: 'bold', color: COLORS.white });
        ctx.restore();

        drawPrompt(ctx, t('title.start'), this.time, 700);
        drawText(ctx, t('title.controls'), VIEW.width / 2, 748, { size: 15, color: COLORS.chrome });
        drawText(ctx, t('title.credit'), VIEW.width / 2, 776, { size: 13, color: 'rgba(223,231,242,0.6)' });
    }
}

/** Dusk over the mountains behind the logo. */
const DUSK = {
    sky: [
        [0, '#060a26'],
        [0.55, '#3b1d5a'],
        [0.85, '#c2456b'],
        [1, '#f39a4a'],
    ],
    sun: { x: VIEW.width * 0.66, y: HORIZON - 40, r: 140, color: 'rgba(255,214,140,1)' },
    ranges: [
        { color: '#4a2550', base: HORIZON - 40, height: 170, scale: 0.0045 },
        { color: '#2b1638', base: HORIZON - 10, height: 130, scale: 0.007 },
        { color: '#130b1f', base: HORIZON + 30, height: 110, scale: 0.011 },
    ],
    ground: '#07040c',
    groundY: HORIZON + 140,
};
