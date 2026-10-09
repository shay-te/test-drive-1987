import { VIEW } from '../config.js';
import { linearGradient } from '../util/canvas.js';
import { COLORS, font } from './theme.js';

/** The spinner's line (share of its radius), how bright its ring shows, its arc (rad) and speed. */
const SPINNER = { thickness: 0.18, ring: 0.35, sweep: Math.PI * 1.3, turnsPerSecond: 1.1 };

/** A dark translucent panel with a thin light edge (overlays on the windshield and menus). */
export function drawPanel(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = COLORS.veil;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

/** Text drawn with one call: `style` = {size, family, weight, color, align, baseline}. */
export function drawText(ctx, text, x, y, style = {}) {
    ctx.save();
    ctx.font = font(style.size ?? 20, style.family ?? 'ui', style.weight ?? 'normal');
    ctx.fillStyle = style.color ?? COLORS.white;
    ctx.textAlign = style.align ?? 'center';
    ctx.textBaseline = style.baseline ?? 'middle';
    if (style.glow) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = (style.size ?? 20) * 0.4;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
}

/** The chrome "TEST DRIVE" logo, italic and outlined like the 1987 box art. */
export function drawLogo(ctx, text, x, y, size) {
    ctx.save();
    ctx.font = `italic ${font(size, 'display')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.09;
    ctx.strokeStyle = '#0a1238';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = linearGradient(ctx, 0, y - size / 2, 0, y + size / 2, [
        [0, '#ffffff'],
        [0.45, COLORS.chrome],
        [0.5, '#6d7f9c'],
        [0.75, '#c8d6ea'],
        [1, '#f4f8ff'],
    ]);
    ctx.fillText(text, x, y);
    ctx.restore();
}

/** A blinking prompt line near the bottom of the screen. */
export function drawPrompt(ctx, text, time, y = VIEW.height - 70) {
    if (Math.floor(time * 2) % 2 === 1) return;
    drawText(ctx, text, VIEW.width / 2, y, {
        size: 24,
        weight: 'bold',
        color: COLORS.accent,
        glow: COLORS.accent,
    });
}

/** A bold red word laid over artwork, like a rubber stamp. */
/** A loading spinner at (x, y), `radius` px: an arc chasing round a faint ring, turning with `time` (s). */
export function drawSpinner(ctx, x, y, radius, time) {
    ctx.save();
    ctx.lineWidth = radius * SPINNER.thickness;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.paperLine;
    ctx.globalAlpha = SPINNER.ring;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.accent;
    const start = time * SPINNER.turnsPerSecond * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, start, start + SPINNER.sweep);
    ctx.stroke();
    ctx.restore();
}

export function drawStamp(ctx, text, x, y, size) {
    drawText(ctx, text, x, y, { size, weight: 'bold', color: COLORS.danger, glow: COLORS.ink });
}

/** Full-screen gradient backdrop used by the menus. */
export function drawBackdrop(ctx, top, bottom) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, VIEW.height, [
        [0, top],
        [1, bottom],
    ]);
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}
