import { createRng } from './math.js';

/** Sprinkles random light/dark specks over the whole canvas (paint grain, leather, asphalt). */
export function speckle(ctx, width, height, { count, alpha = 0.2, size = 1, seed = 1, dark = 0.5 }) {
    const rng = createRng(seed);
    for (let i = 0; i < count; i++) {
        const shade = rng() < dark ? 0 : 255;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha * rng()})`;
        ctx.fillRect(rng() * width, rng() * height, size * (0.5 + rng()), size * (0.5 + rng()));
    }
}

/** Draws `text` with '\n' line breaks centred on (x, y). */
export function multilineText(ctx, text, x, y, lineHeight) {
    const lines = text.split('\n');
    const top = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, x, top + i * lineHeight);
    });
}

/** Linear gradient from a list of [offset, colour] stops. */
export function linearGradient(ctx, x0, y0, x1, y1, stops) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
}

export function radialGradient(ctx, x, y, r0, r1, stops) {
    const gradient = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
}
