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

/** Converts a height field (Float32Array, w*h, values 0..1) into a tangent-space normal map. */
export function normalMapFromHeights(ctx, heights, width, height, strength) {
    const image = ctx.createImageData(width, height);
    const at = (x, y) => {
        return heights[((y + height) % height) * width + ((x + width) % width)];
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
            const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const len = Math.hypot(dx, dy, 1);
            const i = (y * width + x) * 4;
            image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
            image.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
            image.data[i + 2] = (1 / len) * 255;
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
}
