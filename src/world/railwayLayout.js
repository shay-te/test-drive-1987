import { ROAD } from '../config.js';
import { RAILWAY } from '../data/scenery.js';
import { lerp } from '../util/math.js';
import { unpackMicro, worldOf } from './routeFrame.js';

/** A point further than this (m) from where the road frame puts it lies off the stage's ends. */
const OFF_FRAME = 1;
/** Every SCAN-th node is tried for the nearest one before projecting onto the road. */
const SCAN = 4;

/** The railway (`data` from scripts/import-railway.mjs) laid on a stage's ground: each stretch over
 *  the landscape and clear of the road's corridor as { bridge, points: [{ x, z, ground (under the
 *  bed), feet ([left, right] ground where its flanks end), y (top of the bed) }] } every RAILWAY.step
 *  m. The bed follows the ground smoothed along the line, is never buried in it and stays above the
 *  sea; a bridge runs straight from one end to the other. */
export function layOutRailway(data, track, landscape) {
    const runs = [];
    for (const line of data.lines) {
        const points = resample(unpackMicro(line.p).map(([lat, lon]) => { return worldOf(track, lat, lon); }));
        let run = [];
        let hint = track.nearestNode(points[0].x, points[0].z, SCAN);
        const close = () => {
            if (run.length > 1) runs.push({ bridge: line.bridge, points: bed(run, line.bridge, landscape.waterLevel) });
            run = [];
        };
        points.forEach((point, k) => {
            const p = track.project(point.x, point.z, hint);
            hint = p.i;
            const on = track.toWorld(p.s, p.u);
            const beside = Math.hypot(on.x - point.x, on.z - point.z) < OFF_FRAME;
            const corridor = beside && p.u > ROAD.edgeOffset - RAILWAY.clearance && p.u < track.wallOffsetAt(p.s) + RAILWAY.clearance;
            if (!landscape.covers(point.x, point.z) || corridor) {
                close();
                return;
            }
            // Across the line, square to it: the bed's edges and its flanks' feet.
            const [prev, next] = [points[Math.max(0, k - 1)], points[Math.min(points.length - 1, k + 1)]];
            const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
            const across = (m) => {
                return landscape.heightAt(point.x - ((next.z - prev.z) / length) * m, point.z + ((next.x - prev.x) / length) * m);
            };
            const half = RAILWAY.bed.top / 2;
            const foot = half + RAILWAY.bed.spread;
            const ground = Math.max(landscape.heightAt(point.x, point.z), across(-half), across(half));
            run.push({ ...point, ground, feet: [across(-foot), across(foot)] });
        });
        close();
    }
    return runs;
}

/** `points` ({ x, z }) at most RAILWAY.step m apart along their line. */
function resample(points) {
    const out = [points[0]];
    for (let k = 1; k < points.length; k++) {
        const [a, b] = [points[k - 1], points[k]];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / RAILWAY.step));
        for (let n = 1; n <= steps; n++) out.push({ x: lerp(a.x, b.x, n / steps), z: lerp(a.z, b.z, n / steps) });
    }
    return out;
}

/** The top of the bed along a run: on a bridge straight from end to end; elsewhere a smooth line over
 *  the ground (each point lifted to the highest ground within RAILWAY.smooth / 2 m, then averaged over
 *  as much, which is never below the ground and has no steps); RAILWAY.aboveSea over the `sea`; a
 *  bridge's deck raised to clear the ground under all of it. */
function bed(run, bridge, sea) {
    const reach = Math.round(RAILWAY.smooth / RAILWAY.step / 2);
    const lowest = sea + RAILWAY.aboveSea;
    const window = (values, k) => { return values.slice(Math.max(0, k - reach), k + reach + 1); };
    const grounds = run.map((p) => { return p.ground; });
    const lifted = grounds.map((_, k) => { return Math.max(...window(grounds, k)); });
    const [first, last] = [grounds[0], grounds.at(-1)].map((g) => { return Math.max(g, lowest); });
    const span = (k) => { return lerp(first, last, k / (run.length - 1)); };
    // A bridge's deck runs straight, high enough to clear the ground anywhere under it.
    const clear = Math.max(0, ...grounds.map((g, k) => { return g - span(k); }));
    return run.map((point, k) => {
        if (bridge) return { ...point, y: span(k) + clear + RAILWAY.bed.height };
        const near = window(lifted, k);
        const smooth = near.reduce((sum, h) => { return sum + h; }, 0) / near.length;
        return { ...point, y: Math.max(smooth, lowest) + RAILWAY.bed.height };
    });
}
