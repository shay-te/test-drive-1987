import { GAME, VIEW } from '../config.js';
import { t } from '../i18n/i18n.js';
import { clamp } from '../util/math.js';
import { COLORS, font } from './theme.js';
import { drawPanel, drawPrompt, drawText } from './widgets.js';

const CENTER = VIEW.width / 2;
const TICKET = { x: 400, y: 150, w: 480, h: 470, line: 46 };
const BANNER = { w: 760, h: 120, y: 120 };
/** Readout panels: one field wide each, along the bottom edge (`left` in px, or centred when null). */
const READOUT = { field: 150, h: 92, bottom: 28, size: 44, label: 15 };
/** The driver's-seat gear panel sits in the corner, clear of the wheel and the dials. */
const GEAR_CORNER = 28;

// Messages drawn over the windshield while driving: stage intro, crash, ticket, pause, notices.

export function drawLoading(ctx, time, failed = false, retryKey = 'drive.assetRetry') {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, t(failed ? 'drive.assetError' : 'drive.loading'), CENTER, VIEW.height / 2, { size: 26, color: COLORS.chrome });
    drawPrompt(ctx, t(failed ? retryKey : 'general.loading'), time, VIEW.height / 2 + 50);
}

/** "STAGE 2 OF 5 — name" and how to pull away, fading out after `time` seconds. */
export function drawStageIntro(ctx, stage, n, total, time, duration) {
    ctx.save();
    ctx.globalAlpha = clamp((duration - time) * 2, 0, 1);
    drawPanel(ctx, CENTER - BANNER.w / 2, BANNER.y, BANNER.w, BANNER.h);
    drawText(ctx, t('drive.stageIntro', { n, total, name: stage.name }), CENTER, BANNER.y + 44, {
        size: 30,
        family: 'display',
        color: COLORS.accent,
    });
    drawText(ctx, t('drive.startHint'), CENTER, BANNER.y + 88, { size: 18, color: COLORS.chrome });
    ctx.restore();
}

/** A short notice near the top (pursuit, escape, engine warning). */
export function drawToast(ctx, text, alpha, color = COLORS.white) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    drawPanel(ctx, CENTER - 300, 70, 600, 56);
    drawText(ctx, text, CENTER, 98, { size: 22, weight: 'bold', color });
    ctx.restore();
}

export function drawCrash(ctx, causeKey, detail, chances, over, time) {
    drawPanel(ctx, CENTER - 330, 200, 660, detail ? 236 : 200);
    drawText(ctx, t(`crash.${causeKey}`), CENTER, 255, { size: 34, family: 'display', color: COLORS.danger });
    if (detail) drawText(ctx, detail, CENTER, 300, { size: 20, color: COLORS.white });
    const status = over ? t('results.gameOver') : t('crash.chancesLeft', { n: chances });
    const offset = detail ? 36 : 0;
    drawText(ctx, status, CENTER, 310 + offset, { size: 22, color: COLORS.chrome });
    drawPrompt(ctx, t('crash.continue'), time, 365 + offset);
}

/** The speeding citation, filled in like the patrolman's pad. */
export function drawTicket(ctx, car, mph, time) {
    const k = TICKET;
    ctx.save();
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(k.x + 10, k.y + 12, k.w, k.h);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.fillStyle = COLORS.navy;
    ctx.fillRect(k.x, k.y, k.w, 64);
    ctx.restore();
    drawText(ctx, t('ticket.agency'), CENTER, k.y + 24, { size: 20, family: 'display', color: COLORS.white });
    drawText(ctx, t('ticket.notice'), CENTER, k.y + 48, { size: 14, weight: 'bold', color: COLORS.chrome });
    const rows = [
        [t('ticket.vehicle'), car.fullName],
        [t('ticket.recorded'), `${Math.round(mph)} ${t('general.mph')}`],
        [t('ticket.zone'), `${GAME.speedLimitMph} ${t('general.mph')}`],
        [t('ticket.penalty'), t('ticket.seconds', { n: GAME.ticketPenaltySec })],
        [t('ticket.officer'), t('ticket.signature')],
    ];
    rows.forEach(([label, value], i) => {
        const y = k.y + 110 + i * k.line;
        ctx.font = font(17, 'mono', 'bold');
        ctx.fillStyle = COLORS.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, k.x + 28, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.graph;
        ctx.fillText(value, k.x + k.w - 28, y);
        ctx.fillStyle = COLORS.paperLine;
        ctx.fillRect(k.x + 28, y + 16, k.w - 56, 1);
    });
    drawPrompt(ctx, t('crash.continue'), time, k.y + k.h - 40);
}

/** Readout colours for the engine's revs (see revState). */
const REV_COLORS = { normal: COLORS.white, high: COLORS.accent, over: COLORS.danger };

/** A bottom-edge panel of [value, label, color?] fields; centred, or at `left`. */
function drawReadout(ctx, fields, left = null) {
    const r = READOUT;
    const w = r.field * fields.length;
    const x = left ?? CENTER - w / 2;
    const y = VIEW.height - r.bottom - r.h;
    drawPanel(ctx, x, y, w, r.h);
    fields.forEach(([value, label, color = COLORS.white], i) => {
        const cx = x + r.field * (i + 0.5);
        drawText(ctx, value, cx, y + r.h * 0.42, { size: r.size, family: 'display', color });
        drawText(ctx, label, cx, y + r.h * 0.82, { size: r.label, color: COLORS.chrome });
    });
}

/** The outside view's instruments, which cannot be seen from there: speed, revs (amber near the
 *  redline, red past it), gear, and boost on a turbo car (`psi` null without one). */
export function drawOutsideReadout(ctx, { mph, rpm, rev, gear, psi }) {
    const fields = [
        [String(Math.round(mph)), t('general.mph')],
        [String(Math.round(rpm / 50) * 50), t('general.rpm'), REV_COLORS[rev]],
        [gear, t('general.gear')],
    ];
    if (psi !== null) fields.push([psi.toFixed(1), `${t('general.boost')} ${t('general.psi')}`]);
    drawReadout(ctx, fields);
}

/** The gear you are in, always on show from the driver's seat. */
export function drawGear(ctx, gear) {
    drawReadout(ctx, [[gear, t('general.gear')]], GEAR_CORNER);
}

export function drawPaused(ctx) {
    ctx.fillStyle = COLORS.veil;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, t('general.paused'), CENTER, VIEW.height / 2 - 20, {
        size: 64,
        family: 'display',
        color: COLORS.white,
    });
    drawText(ctx, t('drive.pausedHint'), CENTER, VIEW.height / 2 + 40, { size: 20, color: COLORS.chrome });
}
