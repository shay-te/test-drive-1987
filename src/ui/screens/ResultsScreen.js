import { VIEW } from '../../config.js';
import { STAGES } from '../../data/stages.js';
import { inputKey, t } from '../../i18n/i18n.js';
import { formatClock } from '../../util/format.js';
import { COLORS } from '../theme.js';
import { drawBackdrop, drawPanel, drawPrompt, drawText } from '../widgets.js';

const NAME_LENGTH = 12;
const TABLE = { x: 200, w: 880, top: 170, row: 34 };
const COLUMNS = [0.04, 0.5, 0.68, 0.96];
const SCORES_SHOWN = 8;

/** End of a run: the summit (or game over), the stage sheet, bonus, and the high-score table. */
export class ResultsScreen {
    constructor({ game, input, world, scores }) {
        Object.assign(this, { game, input, world, scores });
        this.time = 0;
        this.name = '';
    }

    enter({ session }) {
        this.world.clear();
        this.session = session;
        this.summit = session.results.length === STAGES.length;
        this.score = session.finalScore;
        this.entering = this.scores.qualifies(this.score);
        this.input.takeTyped();
    }

    update(dt) {
        this.time += dt;
        const input = this.input;
        if (this.entering) {
            for (const key of input.takeTyped()) this._type(key);
            if (input.pressed('back')) this.name = this.name.slice(0, -1);
            // A touch screen has no keys: a tap asks for the name in the device's own text box.
            if (input.pressed('confirm') && input.touch && !this.name) for (const key of input.askText(t('results.yourName'))) this._type(key);
            if (input.pressed('confirm') && this.name) {
                this.rank = this.scores.add({
                    name: this.name,
                    score: this.score,
                    car: this.session.car.fullName,
                });
                this.entering = false;
            }
            return;
        }
        if (input.pressed('confirm')) this.game.go('title');
    }

    /** Adds a typed character to the name, if it is one and there is room. */
    _type(key) {
        if (key.length === 1 && key.trim() && this.name.length < NAME_LENGTH) this.name += key.toUpperCase();
    }

    render(ctx) {
        drawBackdrop(ctx, COLORS.navy, '#02040f');
        drawText(ctx, this.summit ? t('results.summit') : t('results.gameOver'), VIEW.width / 2, 60, {
            size: 38,
            family: 'display',
            color: this.summit ? COLORS.accent : COLORS.danger,
        });
        if (this.summit)
            drawText(ctx, t('results.dealer'), VIEW.width / 2, 110, { size: 19, color: COLORS.chrome });
        else if (this.session.arrested)
            drawText(ctx, t('results.jailed'), VIEW.width / 2, 110, { size: 19, color: COLORS.chrome });
        this._sheet(ctx);
        if (this.entering) {
            drawPrompt(ctx, t(inputKey('results.enterName', this.input.touch)), this.time, VIEW.height - 120);
            drawText(ctx, `${this.name}_`, VIEW.width / 2, VIEW.height - 70, {
                size: 34,
                family: 'mono',
                weight: 'bold',
                color: COLORS.lcd,
            });
        } else {
            this._highScores(ctx);
            drawPrompt(ctx, t(inputKey('results.continue', this.input.touch)), this.time, VIEW.height - 34);
        }
    }

    _sheet(ctx) {
        const s = this.session;
        const header = [t('general.stage'), t('general.time'), t('general.mph'), t('general.points')];
        const rows = s.results.map((r) => {
            return [STAGES[r.stage].name, formatClock(r.time), r.avgMph.toFixed(1), String(r.points)];
        });
        rows.push(['', formatClock(s.totalTime), '', String(s.totalScore)]);
        rows.push([t('results.chancesBonus'), '', '', String(s.bonus ?? 0)]);
        rows.push([t('results.finalScore'), '', '', String(this.score)]);
        drawPanel(ctx, TABLE.x - 20, TABLE.top - 30, TABLE.w + 40, (rows.length + 1) * TABLE.row + 30);
        [header, ...rows].forEach((cells, i) => {
            const y = TABLE.top + i * TABLE.row;
            const color = i === 0 ? COLORS.accent : i === rows.length ? COLORS.lcd : COLORS.white;
            cells.forEach((cell, c) => {
                drawText(ctx, cell, TABLE.x + COLUMNS[c] * TABLE.w, y, {
                    size: 19,
                    family: 'mono',
                    weight: 'bold',
                    color,
                    align: c === 0 ? 'left' : 'right',
                });
            });
        });
    }

    _highScores(ctx) {
        const top = TABLE.top + (this.session.results.length + 5) * TABLE.row;
        drawText(ctx, t('results.highScores'), VIEW.width / 2, top, {
            size: 22,
            family: 'display',
            color: COLORS.accent,
        });
        const entries = this.scores.entries.slice(0, SCORES_SHOWN);
        if (!entries.length)
            drawText(ctx, t('results.empty'), VIEW.width / 2, top + 36, { color: COLORS.chrome });
        entries.forEach((entry, i) => {
            const y = top + 34 + i * 26;
            const color = i === this.rank ? COLORS.lcd : COLORS.chrome;
            const style = { size: 17, family: 'mono', weight: 'bold', color };
            drawText(ctx, `${i + 1}. ${entry.name}`, TABLE.x + 120, y, { ...style, align: 'left' });
            drawText(ctx, entry.car, VIEW.width / 2, y, style);
            drawText(ctx, String(entry.score), TABLE.x + TABLE.w - 120, y, { ...style, align: 'right' });
        });
    }
}
