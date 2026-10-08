import { VIEW } from '../config.js';
import { radialGradient } from '../util/canvas.js';
import { TAU, createRng } from '../util/math.js';

const RAYS = 16;
const RINGS = 5;

/** Paints a shattered windshield spreading from an impact point (deterministic per seed). */
export function drawCrack(ctx, { x, y, seed }) {
    const rng = createRng(seed);
    const reach = VIEW.width * 0.75;
    const rays = Array.from({ length: RAYS }, (_, i) => {
        const angle = (i / RAYS) * TAU + rng.range(-0.15, 0.15);
        const points = [[x, y]];
        let r = 0;
        while (r < reach) {
            r += rng.range(30, 90);
            const a = angle + rng.range(-0.12, 0.12);
            points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
        }
        return points;
    });

    // Concentric fractures joining neighbouring rays.
    const rings = [];
    for (let ring = 1; ring <= RINGS; ring++) {
        rays.forEach((ray, i) => {
            const next = rays[(i + 1) % RAYS];
            if (rng() < 0.75)
                rings.push([ray[Math.min(ring, ray.length - 1)], next[Math.min(ring, next.length - 1)]]);
        });
    }

    ctx.save();
    ctx.fillStyle = radialGradient(ctx, x, y, 0, 70, [
        [0, 'rgba(235,240,245,0.75)'],
        [1, 'rgba(235,240,245,0)'],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, 70, 0, TAU);
    ctx.fill();
    for (const [stroke, width] of [
        ['rgba(0,0,0,0.35)', 3],
        ['rgba(240,245,250,0.85)', 1.3],
    ]) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (const polyline of [...rays, ...rings]) {
            ctx.moveTo(polyline[0][0], polyline[0][1]);
            for (const [px, py] of polyline.slice(1)) ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();
}
