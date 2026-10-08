import { VIEW } from '../config.js';
import { linearGradient, radialGradient } from '../util/canvas.js';
import { Noise } from '../util/math.js';

/** Painted backdrops for the menus: a graded sky with a sun glow over ridged mountain ranges.
 *  `look` = {sky: [[offset, colour]...], sun: {x, y, r, colour}, ranges: [{color, base, height, scale}], ground}. */
export function paintScenery(ctx, look, horizon) {
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, horizon, look.sky);
    ctx.fillRect(0, 0, VIEW.width, horizon);
    const sun = look.sun;
    ctx.fillStyle = radialGradient(ctx, sun.x, sun.y, 10, sun.r, [
        [0, sun.color],
        [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, VIEW.width, horizon);
    const noise = new Noise(1987);
    for (const range of look.ranges) {
        ctx.fillStyle = range.color;
        ctx.beginPath();
        ctx.moveTo(0, VIEW.height);
        for (let x = 0; x <= VIEW.width; x += 8) {
            ctx.lineTo(x, range.base - noise.ridged2(x * range.scale, range.base * 0.01) * range.height);
        }
        ctx.lineTo(VIEW.width, VIEW.height);
        ctx.fill();
    }
    ctx.fillStyle = look.ground;
    ctx.fillRect(0, look.groundY, VIEW.width, VIEW.height - look.groundY);
}
