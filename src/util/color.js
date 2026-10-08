import { clamp } from './math.js';

/** Colour helpers working on [r, g, b] arrays with components in 0..255. */

const byte = (v) => {
    return Math.round(clamp(v, 0, 255));
};

export function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function css(c, alpha = 1) {
    const rgb = `${byte(c[0])},${byte(c[1])},${byte(c[2])}`;
    return alpha >= 1 ? `rgb(${rgb})` : `rgba(${rgb},${alpha})`;
}

/** Lightens (f > 1) or darkens (f < 1) a hex colour; returns a CSS colour. */
export function shadeHex(hex, f) {
    const c = hexToRgb(hex);
    const shaded = f > 1 ? mixRgb(c, [255, 255, 255], Math.min(1, f - 1)) : mixRgb([0, 0, 0], c, f);
    return css(shaded);
}

export function withAlpha(hex, alpha) {
    return css(hexToRgb(hex), alpha);
}
