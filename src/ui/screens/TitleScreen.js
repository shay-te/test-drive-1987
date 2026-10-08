import { VIEW } from '../../config.js';
import { CARS, carById, isLocked, neighbourCar } from '../../data/cars.js';
import { t } from '../../i18n/i18n.js';
import { clamp } from '../../util/math.js';
import { drawCarArt, drawGroundShadow } from '../CarArt.js';
import { paintScenery } from '../scenery.js';
import { COLORS } from '../theme.js';
import { whenPhotographed } from '../photos.js';
import { drawLogo, drawPrompt, drawStamp, drawText } from '../widgets.js';

const FADE_SECONDS = 0.25;
const LOCKED_ALPHA = 0.35;
const STAMP = { y: 515, size: 64 };
const ART_WIDTH = 560;
/** The car's canvas: side padding, ground line and height, in logical pixels. */
const ART = { pad: 20, ground: 230, height: 260 };
const HORIZON = 470;

/** Title: sunset over the mountains, the chrome logo and the car chosen with the arrows, side-on. */
export class TitleScreen {
    constructor({ game, display, resources, audio, input, world }) {
        Object.assign(this, { game, display, resources, audio, input, world });
        this.time = 0;
        this.car = CARS[0];
        this.chosenAt = 0;
        this.photos = new Map();
    }

    /** Shows `carId` when coming back from the brochure, otherwise the first car. */
    enter({ carId } = {}) {
        this.world.clear();
        this.car = carById(carId);
        this._showPhoto();
    }

    update(dt) {
        this.time += dt;
        const step = this.input.menuStep();
        if (step) {
            this.car = neighbourCar(this.car, step);
            this.chosenAt = this.time;
            this._showPhoto();
            this._click();
        }
        if (this.input.pressed('confirm') && !isLocked(this.car)) {
            this._click();
            this.game.go('select', { carId: this.car.id });
        }
    }

    /** Photographs the car on show; the others wait until they are chosen. */
    _showPhoto() {
        const car = this.car;
        whenPhotographed(this.world.profile(car), car.id, (photo) => {
            if (this.photos.get(car.id) === photo) return;
            this.photos.set(car.id, photo);
            if (car === this.car) this.chosenAt = this.time;
        });
    }

    _click() {
        this.audio.unlock().then(() => {
            this.audio.play('click', { bus: 'ui' });
        });
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

        const car = this.car;
        const locked = isLocked(car);
        const photo = this.photos.get(car.id);
        const art = this.resources.scaledCanvas(
            `${photo ? 'photo' : 'art'}:${car.id}:${ART_WIDTH}`,
            ART_WIDTH + 2 * ART.pad,
            ART.height,
            scale,
            (c) => {
                if (!photo) {
                    drawCarArt(c, car, ART.pad, ART.ground, ART_WIDTH);
                    return;
                }
                const height = (ART_WIDTH * photo.height) / photo.width;
                drawGroundShadow(c, ART.pad, ART.ground, ART_WIDTH);
                c.drawImage(photo, ART.pad, ART.ground - height, ART_WIDTH, height);
            },
        );
        const fade = clamp((this.time - this.chosenAt) / FADE_SECONDS, 0, 1);
        ctx.save();
        ctx.globalAlpha = fade * (locked ? LOCKED_ALPHA : 1);
        ctx.drawImage(art, (VIEW.width - ART_WIDTH) / 2 - ART.pad, 360, ART_WIDTH + 2 * ART.pad, ART.height);
        ctx.globalAlpha = fade;
        if (locked) drawStamp(ctx, t('general.locked'), VIEW.width / 2, STAMP.y, STAMP.size);
        drawText(ctx, t('title.choice', { car: car.fullName }), VIEW.width / 2, 640, {
            size: 22,
            weight: 'bold',
            color: COLORS.white,
        });
        ctx.restore();

        drawPrompt(ctx, t(locked ? 'select.locked' : 'title.start'), this.time, 700);
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
