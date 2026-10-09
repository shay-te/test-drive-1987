import { PHYS, VIEW } from '../../config.js';
import { CARS, carById, isLocked, neighbourCar } from '../../data/cars.js';
import { inputKey, t } from '../../i18n/i18n.js';
import { Drivetrain } from '../../sim/Drivetrain.js';
import { Session } from '../../sim/Session.js';
import { linearGradient, speckle } from '../../util/canvas.js';
import { drawCarArt } from '../CarArt.js';
import { COLORS, font } from '../theme.js';
import { whenPhotographed } from '../photos.js';
import { drawPrompt, drawStamp, drawText } from '../widgets.js';

const BAND = 352;
const ART_WIDTH = 820;
const ROW = 29;
const ROWS_TOP = 396;
const STAMP_SIZE = 72;
const SPEC_KEYS = [
    'layout',
    'engineType',
    'displacement',
    'compression',
    'power',
    'torque',
    'transmission',
    'braking',
];
const PERFORMANCE = [
    ['zeroToSixty'],
    ['zeroToHundred'],
    ['quarterMile', 'quarterMileSpeed'],
    ['topSpeed'],
    ['lbPerBhp'],
    ['lateral'],
];
const SPEC_COLUMN = { x: 40, right: 520 };
const PERFORMANCE_COLUMN = { x: 570, right: 880 };
const GRAPH = { x: 960, y: 410, w: 280, h: 270, maxMph: 120, maxSec: 20, mphStep: 20, secStep: 5 };

/** The 1987 brochure: the car on a navy band, its spec sheet and acceleration graph on paper. */
export class SelectScreen {
    constructor({ game, display, resources, audio, input, world }) {
        Object.assign(this, { game, display, resources, audio, input, world });
        this.car = CARS[0];
        this.time = 0;
        this.artwork = new Map();
    }

    /** Opens on `carId`, chosen on the title or kept from a drive, otherwise on the first car. */
    enter({ carId } = {}) {
        this.world.clear();
        this.car = carById(carId);
        this._showPhoto();
    }

    update(dt) {
        this.time += dt;
        const input = this.input;
        const step = input.menuStep();
        if (step) this._move(step);
        if (input.pressed('confirm') && !isLocked(this.car)) {
            this.audio.play('click', { bus: 'ui' });
            this.game.go('drive', { session: new Session(this.car) });
        } else if (input.pressed('back')) {
            this.game.go('title', { carId: this.car.id });
        }
    }

    _move(step) {
        this.car = neighbourCar(this.car, step);
        this._showPhoto();
        this.audio.play('click', { bus: 'ui' });
    }

    /** Puts the photo of the car on show onto its brochure page once it is ready. */
    _showPhoto() {
        const car = this.car;
        whenPhotographed(this.world.profile(car), car.id, (photo) => {
            if (this.artwork.get(car.id) === photo) return;
            this.artwork.set(car.id, photo);
            this.resources.evict(`canvas:brochure:${car.id}`);
        });
    }

    render(ctx) {
        const car = this.car;
        const page = this.resources.scaledCanvas(
            `brochure:${car.id}`,
            VIEW.width,
            VIEW.height,
            this.display.scale,
            (c) => {
                paintBrochure(c, car, this.artwork.get(car.id));
            },
        );
        ctx.drawImage(page, 0, 0, VIEW.width, VIEW.height);
        drawPrompt(ctx, t(isLocked(car) ? 'select.locked' : inputKey('select.hint', this.input.touch)), this.time, BAND - 22);
    }
}

function paintBrochure(ctx, car, image) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, BAND, [
        [0, COLORS.navy],
        [1, COLORS.navyLight],
    ]);
    ctx.fillRect(0, 0, VIEW.width, BAND);
    const x = (VIEW.width - ART_WIDTH) / 2;
    const ground = BAND - 46;
    if (image) {
        const height = ART_WIDTH * image.height / image.width;
        ctx.drawImage(image, x, ground - height, ART_WIDTH, height);
    } else {
        drawCarArt(ctx, car, x, ground, ART_WIDTH);
    }
    if (isLocked(car)) drawStamp(ctx, t('general.locked'), VIEW.width / 2, ground - STAMP_SIZE, STAMP_SIZE);
    outlinedTitle(ctx, car.make, 40, 52, 44);
    outlinedTitle(ctx, car.model, 40, 100, 34);

    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, BAND, VIEW.width, VIEW.height - BAND);
    ctx.save();
    ctx.translate(0, BAND);
    speckle(ctx, VIEW.width, VIEW.height - BAND, { count: 5000, alpha: 0.06, seed: 9 });
    ctx.restore();
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, BAND, VIEW.width, 4);

    const b = car.brochure;
    SPEC_KEYS.forEach((key, i) => {
        specRow(ctx, SPEC_COLUMN, ROWS_TOP + i * ROW, t(`select.${key}`), b.specs[key]);
    });
    const tiresY = ROWS_TOP + SPEC_KEYS.length * ROW;
    b.tires.forEach((line, i) => {
        specRow(ctx, SPEC_COLUMN, tiresY + i * ROW, i === 0 ? t('select.tires') : '', line);
    });

    drawText(ctx, `${t('select.price')} ${b.price}`, PERFORMANCE_COLUMN.x, ROWS_TOP, {
        size: 20,
        family: 'mono',
        weight: 'bold',
        color: COLORS.ink,
        align: 'left',
    });
    PERFORMANCE.forEach((keys, i) => {
        const value = keys
            .map((key) => {
                return b[key];
            })
            .join(' ');
        specRow(ctx, PERFORMANCE_COLUMN, ROWS_TOP + (i + 2) * ROW, t(`select.${keys[0]}`), value);
    });
    accelerationGraph(ctx, car);
}

/** Make or model in white capitals with a dark outline, like the brochure header. */
function outlinedTitle(ctx, text, x, y, size) {
    ctx.font = `italic ${font(size, 'display')}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = COLORS.ink;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(text, x, y);
}

/** "Label ........ value" with a dotted leader between them. */
function specRow(ctx, column, y, label, value) {
    ctx.font = font(17, 'mono', 'bold');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'left';
    ctx.fillText(label, column.x, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, column.right, y);
    const from = column.x + ctx.measureText(label).width + 8;
    const to = column.right - ctx.measureText(value).width - 8;
    ctx.fillStyle = COLORS.paperLine;
    for (let x = from; x < to; x += 7) ctx.fillRect(x, y + 5, 2, 2);
}

/** Speed against time from a simulated road test, with the upshift points marked. */
function accelerationGraph(ctx, car) {
    const g = GRAPH;
    const launch = new Drivetrain(car).roadTest(g.maxSec, g.maxMph * PHYS.mph);
    const px = (sec) => {
        return g.x + (sec / g.maxSec) * g.w;
    };
    const py = (mph) => {
        return g.y + g.h - (mph / g.maxMph) * g.h;
    };
    drawText(ctx, t('select.acceleration'), g.x + g.w / 2, g.y - 22, {
        size: 18,
        family: 'mono',
        weight: 'bold',
        color: COLORS.ink,
    });
    ctx.strokeStyle = COLORS.paperLine;
    ctx.lineWidth = 1;
    ctx.font = font(13, 'mono', 'bold');
    ctx.fillStyle = COLORS.ink;
    ctx.textBaseline = 'middle';
    for (let mph = 0; mph <= g.maxMph; mph += g.mphStep) {
        ctx.beginPath();
        ctx.moveTo(g.x, py(mph));
        ctx.lineTo(g.x + g.w, py(mph));
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(String(mph), g.x - 6, py(mph));
    }
    for (let sec = 0; sec <= g.maxSec; sec += g.secStep) {
        ctx.beginPath();
        ctx.moveTo(px(sec), g.y);
        ctx.lineTo(px(sec), g.y + g.h);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(String(sec), px(sec), g.y + g.h + 14);
    }
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x, g.y, g.w, g.h);
    drawText(ctx, t('select.timeAxis'), g.x + g.w / 2, g.y + g.h + 36, {
        size: 13,
        family: 'mono',
        weight: 'bold',
        color: COLORS.ink,
    });
    ctx.save();
    ctx.translate(g.x - 44, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, t('select.speedAxis'), 0, 0, {
        size: 13,
        family: 'mono',
        weight: 'bold',
        color: COLORS.ink,
    });
    ctx.restore();

    ctx.strokeStyle = COLORS.graph;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    for (const [sec, speed] of launch.trace) ctx.lineTo(px(sec), py(speed / PHYS.mph));
    ctx.stroke();
    ctx.fillStyle = COLORS.danger;
    ctx.font = font(12, 'mono', 'bold');
    ctx.textAlign = 'left';
    for (const shift of launch.shifts) {
        const x = px(shift.t);
        const y = py(shift.v / PHYS.mph);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(`${shift.from}-${shift.to}`, x + 6, y + 10);
    }
}
