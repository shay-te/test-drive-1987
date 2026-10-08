import { GAME } from '../config.js';
import { STAGES } from '../data/stages.js';
import { t } from '../i18n/i18n.js';
import { COLORS, font } from '../ui/theme.js';
import { radialGradient } from '../util/canvas.js';
import { formatClock, formatMiles } from '../util/format.js';
import { TAU } from '../util/math.js';

/** Maps a real session and remaining road distance to the trip computer's information. */
export function tripInfo(session, remaining) {
    return {
        stage: session.stageIndex + 1,
        total: STAGES.length,
        elapsed: session.elapsed,
        remaining: Math.max(0, remaining),
        summit: Boolean(session.stage.summit),
        chances: session.chances,
        maxChances: GAME.chances,
    };
}

/** Text lines of the trip computer: what changes between frames decides when to repaint. */
export function tripLines(view) {
    const info = view.trip;
    const r = view.readings;
    return {
        stage: t('trip.stage', { n: info.stage, total: info.total }),
        clock: formatClock(info.elapsed),
        distance: t(info.summit ? 'trip.toSummit' : 'trip.toGas', { mi: formatMiles(info.remaining) }),
        readout: view.digital
            ? `${Math.round(r.speed)} ${t('general.mph')} ${Math.round(r.rpm * 1000)} ${t('general.rpm')} ${view.gearLabel}`
            : null,
        chances: info.chances,
        maxChances: info.maxChances,
    };
}

/** Paints the trip computer LCD: stage and clock, then miles to go and the chances left
 *  (the digital speed/rpm/gear readout takes the second line when switched on). */
export function paintTripDisplay(ctx, width, height, lines) {
    ctx.fillStyle = radialGradient(ctx, width / 2, 0, 8, width, [
        [0, '#1f2a22'],
        [1, '#0d130f'],
    ]);
    ctx.fillRect(0, 0, width, height);
    const pad = height * 0.14;
    const top = height * 0.4;
    const bottom = height * 0.82;
    ctx.save();
    ctx.fillStyle = COLORS.lcd;
    ctx.shadowColor = COLORS.lcd;
    ctx.shadowBlur = height * 0.08;
    ctx.font = font(height * 0.3, 'mono', 'bold');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(lines.stage, pad, top);
    ctx.fillText(lines.readout ?? lines.distance, pad, bottom);
    ctx.textAlign = 'right';
    ctx.fillText(lines.clock, width - pad, top);
    if (!lines.readout) {
        const r = height * 0.07;
        for (let i = 0; i < lines.maxChances; i++) {
            ctx.globalAlpha = i < lines.chances ? 1 : 0.15;
            ctx.beginPath();
            ctx.arc(width - pad - r - (lines.maxChances - 1 - i) * r * 3, bottom - r * 1.4, r, 0, TAU);
            ctx.fill();
        }
    }
    ctx.restore();
}
