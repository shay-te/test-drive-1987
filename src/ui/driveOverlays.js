import { GAME, VIEW } from '../config.js';
import { t } from '../i18n/i18n.js';
import { clamp } from '../util/math.js';
import { COLORS, font } from './theme.js';
import { drawPanel, drawPrompt, drawText } from './widgets.js';

const CENTER = VIEW.width / 2;
const TICKET = { x: 400, y: 150, w: 480, h: 470, line: 46 };
const BANNER = { w: 760, h: 120, y: 120 };

// Messages drawn over the windshield while driving: stage intro, crash, ticket, pause, notices.

export function drawLoading(ctx, time) {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, t('drive.loading'), CENTER, VIEW.height / 2, { size: 26, color: COLORS.chrome });
    drawPrompt(ctx, t('general.loading'), time, VIEW.height / 2 + 50);
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

export function drawCrash(ctx, causeKey, chances, over, time) {
    drawPanel(ctx, CENTER - 330, 200, 660, 200);
    drawText(ctx, t(`crash.${causeKey}`), CENTER, 255, { size: 34, family: 'display', color: COLORS.danger });
    const status = over ? t('results.gameOver') : t('crash.chancesLeft', { n: chances });
    drawText(ctx, status, CENTER, 310, { size: 22, color: COLORS.chrome });
    drawPrompt(ctx, t('crash.continue'), time, 365);
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
