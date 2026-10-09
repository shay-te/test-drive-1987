import * as THREE from 'three';

const PIXELS = 64;

/** A round sprite picture fading out from its heart: `stops` are [offset (0 heart..1 rim), alpha]. */
export function softDot(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PIXELS;
    const ctx = canvas.getContext('2d');
    const half = PIXELS / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [offset, alpha] of stops) gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, PIXELS, PIXELS);
    return new THREE.CanvasTexture(canvas);
}
