import { linearGradient, radialGradient } from '../util/canvas.js';
import { shadeHex } from '../util/color.js';
import { TAU } from '../util/math.js';

const TYRE = '#111113';
const GLASS_TOP = '#9fb4cc';
const GLASS_BOTTOM = '#141c28';
const TRIM = '#141414';
/** Round headlamps sit on the sloping wing front, leaning back. */
const LAMP_LEAN = 0.45;
const CHROME = [
    [0, '#f4f6f8'],
    [0.5, '#8d9299'],
    [1, '#dfe3e8'],
];

/** The soft shadow a car `width` long casts on the ground beneath it. */
export function drawGroundShadow(ctx, x, groundY, width) {
    ctx.fillStyle = radialGradient(ctx, x + width / 2, groundY, 10, width * 0.55, [
        [0, 'rgba(0,0,0,0.55)'],
        [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.beginPath();
    ctx.ellipse(x + width / 2, groundY + 4, width * 0.56, width * 0.035, 0, 0, TAU);
    ctx.fill();
}

/** Side-view illustration of a car from its `body` data (metres): paint, glass, wheels, details. */
export function drawCarArt(ctx, car, x, groundY, width) {
    const body = car.body;
    const k = width / body.length;
    const px = (bx) => {
        return x + bx * k;
    };
    const py = (by) => {
        return groundY - by * k;
    };
    const toScreen = (points) => {
        return points.map(([bx, by]) => {
            return [px(bx), py(by)];
        });
    };

    ctx.save();
    drawGroundShadow(ctx, x, groundY, width);

    const top = py(body.height);
    ctx.fillStyle = linearGradient(ctx, 0, top, 0, groundY, [
        [0, shadeHex(car.paint, 1.55)],
        [0.35, car.paint],
        [0.62, shadeHex(car.paint, 1.18)],
        [0.7, shadeHex(car.paint, 0.8)],
        [1, shadeHex(car.paint, 0.45)],
    ]);
    smoothPath(ctx, toScreen(body.profile), body.smooth);
    ctx.fill();

    for (const wheel of body.wheels) {
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.arc(px(wheel.x), py(wheel.r), wheel.r * k * 1.16, Math.PI, TAU);
        ctx.fill();
    }
    drawDetails(ctx, car, body, px, py, toScreen, k);
    ctx.fillStyle = linearGradient(ctx, 0, top, 0, py(body.height * 0.55), [
        [0, GLASS_TOP],
        [1, GLASS_BOTTOM],
    ]);
    smoothPath(ctx, toScreen(body.glass), 0.2);
    ctx.fill();
    // Pillars only show between the panes of glass.
    ctx.save();
    smoothPath(ctx, toScreen(body.glass), 0.2);
    ctx.clip();
    ctx.fillStyle = car.paint;
    for (const pillar of body.pillars) ctx.fillRect(px(pillar) - 0.04 * k, top, 0.08 * k, body.height * k);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, k * 0.02);
    smoothPath(ctx, toScreen(body.glass), 0.2);
    ctx.stroke();
    for (const wheel of body.wheels) drawWheel(ctx, px(wheel.x), py(wheel.r), wheel.r * k, body.rim);
    ctx.restore();
}

/** Closed path through the points with the corners rounded by `smooth` (0 = sharp polygon). */
function smoothPath(ctx, points, smooth = 0.35) {
    const n = points.length;
    const mid = (a, b, f) => {
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const prev = points[(i - 1 + n) % n];
        const cur = points[i];
        const next = points[(i + 1) % n];
        const a = mid(cur, prev, smooth / 2);
        const b = mid(cur, next, smooth / 2);
        if (i === 0) ctx.moveTo(a[0], a[1]);
        else ctx.lineTo(a[0], a[1]);
        ctx.quadraticCurveTo(cur[0], cur[1], b[0], b[1]);
    }
    ctx.closePath();
}

function drawDetails(ctx, car, body, px, py, toScreen, k) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, k * 0.012);
    for (const door of body.doorLines) {
        ctx.beginPath();
        ctx.moveTo(px(door), py(0.32));
        ctx.lineTo(px(door + 0.02), py(body.waistLine ?? 0.82));
        ctx.stroke();
    }
    if (body.crease) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px(0.3), py(body.crease), (body.length - 0.6) * k, k * 0.02);
    }
    for (const b of body.bellows ?? []) bellows(ctx, b, px, py, k);
    if (body.spoiler) {
        ctx.fillStyle = shadeHex(car.paint, 0.95);
        smoothPath(ctx, toScreen(body.spoiler), 0.15);
        ctx.fill();
        ctx.fillStyle = TRIM;
        ctx.fillRect(
            px(body.spoiler[1][0]),
            py(body.spoiler[1][1]),
            (body.spoiler[3][0] - body.spoiler[1][0]) * k,
            k * 0.03,
        );
    }
    if (body.wing) {
        ctx.fillStyle = shadeHex(car.paint, 0.92);
        smoothPath(ctx, toScreen(body.wing), 0.1);
        ctx.fill();
    }
    if (body.flare) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px(body.flare.x0), py(body.flare.y), (body.flare.x1 - body.flare.x0) * k, k * 0.03);
    }
    if (body.strakes) slats(ctx, body.strakes, px, py, k, 'horizontal', car.paint);
    if (body.louvres) slats(ctx, body.louvres, px, py, k, 'diagonal', TRIM);
    if (body.gills) {
        ctx.fillStyle = TRIM;
        for (let i = 0; i < body.gills.count; i++) {
            ctx.fillRect(
                px(body.gills.x + i * 0.05),
                py(body.gills.y1),
                k * 0.025,
                (body.gills.y1 - body.gills.y0) * k,
            );
        }
    }
    if (body.molding) {
        ctx.fillStyle = TRIM;
        ctx.fillRect(
            px(0.15),
            py(body.molding.y1),
            (body.length - 0.3) * k,
            (body.molding.y1 - body.molding.y0) * k,
        );
    }
    if (body.naca) {
        ctx.fillStyle = TRIM;
        ctx.beginPath();
        ctx.ellipse(px(body.naca[0]), py(body.naca[1]), k * 0.22, k * 0.045, -0.12, 0, TAU);
        ctx.fill();
    }
    if (body.mirror) {
        ctx.fillStyle = shadeHex(car.paint, 0.8);
        ctx.beginPath();
        ctx.roundRect(
            px(body.mirror[0]) - k * 0.08,
            py(body.mirror[1]) - k * 0.05,
            k * 0.16,
            k * 0.09,
            k * 0.03,
        );
        ctx.fill();
    }
    ctx.fillStyle = '#ff2a1a';
    ctx.fillRect(px(body.lights.tail[0]) - k * 0.03, py(body.lights.tail[1]) - k * 0.05, k * 0.05, k * 0.1);
    const [hx, hy] = body.lights.head;
    if (body.headlamp === 'round') {
        // Upright round lamp in the wing, seen edge-on: chrome ring round a tall lens.
        ctx.fillStyle = linearGradient(ctx, 0, py(hy + 0.09), 0, py(hy - 0.09), CHROME);
        ctx.beginPath();
        ctx.ellipse(px(hx), py(hy), k * 0.035, k * 0.09, LAMP_LEAN, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff1c9';
        ctx.beginPath();
        ctx.ellipse(px(hx) - k * 0.008, py(hy), k * 0.02, k * 0.075, LAMP_LEAN, 0, TAU);
        ctx.fill();
    } else {
        ctx.fillStyle = '#ffd38a';
        ctx.fillRect(px(hx) - k * 0.02, py(hy) - k * 0.03, k * 0.08, k * 0.05);
    }
}

/** Black rubber accordion boot between an impact bumper and the body. */
function bellows(ctx, b, px, py, k) {
    ctx.fillStyle = TRIM;
    ctx.fillRect(px(b.x0), py(b.y1), (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = b.x0 + 0.02; x < b.x1; x += 0.025)
        ctx.fillRect(px(x), py(b.y1), k * 0.006, (b.y1 - b.y0) * k);
}

function slats(ctx, spec, px, py, k, direction, color) {
    ctx.fillStyle = TRIM;
    ctx.fillRect(px(spec.x0), py(spec.y1), (spec.x1 - spec.x0) * k, (spec.y1 - spec.y0) * k);
    ctx.fillStyle = color;
    for (let i = 0; i < spec.count; i++) {
        const f = (i + 0.5) / spec.count;
        if (direction === 'horizontal') {
            ctx.fillRect(
                px(spec.x0),
                py(spec.y0 + f * (spec.y1 - spec.y0)) - k * 0.012,
                (spec.x1 - spec.x0) * k,
                k * 0.024,
            );
        } else {
            const x = spec.x0 + f * (spec.x1 - spec.x0);
            ctx.save();
            ctx.translate(px(x), py((spec.y0 + spec.y1) / 2));
            ctx.rotate(-0.35);
            ctx.fillRect(-k * 0.012, -(spec.y1 - spec.y0) * k * 0.5, k * 0.024, (spec.y1 - spec.y0) * k);
            ctx.restore();
        }
    }
}

/** Tyre plus the car's own rim design. */
function drawWheel(ctx, cx, cy, r, rim) {
    ctx.fillStyle = TYRE;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    const rr = r * 0.68;
    ctx.fillStyle = radialGradient(ctx, cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, rr * 1.2, [
        [0, '#f2f4f6'],
        [0.6, '#a9aeb5'],
        [1, '#5d6168'],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, TAU);
    ctx.fill();
    if (rim === 'fuchs') {
        fuchs(ctx, cx, cy, rr);
        return;
    }
    ctx.fillStyle = '#1a1a1c';
    const holes = { star: 5, dial: 5, cross: 10, turbine: 12 }[rim];
    for (let i = 0; i < holes; i++) {
        const a = (i / holes) * TAU + (rim === 'turbine' ? 0.3 : 0);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.beginPath();
        if (rim === 'dial') ctx.arc(rr * 0.55, 0, rr * 0.2, 0, TAU);
        else if (rim === 'turbine') ctx.ellipse(rr * 0.6, 0, rr * 0.3, rr * 0.06, 0.6, 0, TAU);
        else ctx.ellipse(rr * 0.58, 0, rr * 0.3, rr * (rim === 'cross' ? 0.06 : 0.14), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = '#2b2d31';
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.2, 0, TAU);
    ctx.fill();
}

/** Fuchs forged wheel: polished lip and five polished petals over a black centre. */
function fuchs(ctx, cx, cy, rr) {
    ctx.fillStyle = '#17181b';
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.86, 0, TAU);
    ctx.fill();
    ctx.fillStyle = radialGradient(ctx, cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, rr * 1.1, [
        [0, '#ffffff'],
        [0.6, '#b9bec5'],
        [1, '#6c7178'],
    ]);
    for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i / 5) * TAU - Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(rr * 0.2, -rr * 0.13);
        ctx.quadraticCurveTo(rr * 0.55, -rr * 0.2, rr * 0.86, -rr * 0.3);
        ctx.arc(0, 0, rr * 0.86, -0.36, 0.36);
        ctx.quadraticCurveTo(rr * 0.55, rr * 0.2, rr * 0.2, rr * 0.13);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.fillStyle = '#1d1e21';
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.24, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c9a646';
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.09, 0, TAU);
    ctx.fill();
}
