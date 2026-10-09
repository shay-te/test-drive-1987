import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROAD } from '../src/config.js';
import { RAILWAY, ROUTE_RAILWAY } from '../src/data/scenery.js';
import { STAGES } from '../src/data/stages.js';
import { layOutStage, restoreStage } from '../src/sim/stageData.js';
import { layOutRailway } from '../src/world/railwayLayout.js';

const data = JSON.parse(readFileSync(new URL(`../${ROUTE_RAILWAY}`, import.meta.url)));
const stages = STAGES.map((_, index) => { return restoreStage(layOutStage(index)); });

test('the real railway runs past every stage, out of its tunnels, from OpenStreetMap', () => {
    assert.match(data.source, /OpenStreetMap/);
    assert.ok(data.lines.some((line) => { return line.bridge; }), 'with its bridges');
    for (const [index, { track, landscape }] of stages.entries()) {
        const runs = layOutRailway(data, track, landscape);
        const length = runs.reduce((sum, run) => { return sum + (run.points.length - 1) * RAILWAY.step; }, 0);
        assert.ok(length > 5000, `stage ${index + 1}: ${length} m of track`);
    }
});

test('the track bed lies on the ground, above the sea, smooth along the line, a bridge straight across, never on the road', () => {
    for (const { track, landscape } of stages) {
        for (const run of layOutRailway(data, track, landscape)) {
            const { points } = run;
            for (const [k, p] of points.entries()) {
                assert.ok(p.y >= p.ground + RAILWAY.bed.height - 1e-6, 'buried in the ground');
                assert.ok(p.y >= landscape.waterLevel + RAILWAY.aboveSea, 'under the sea');
                if (k > 0) assert.ok(Math.hypot(p.x - points[k - 1].x, p.z - points[k - 1].z) <= RAILWAY.step * 1.05, 'a gap in the track');
                const at = track.project(p.x, p.z, track.nearestNode(p.x, p.z, 4));
                const on = track.toWorld(at.s, at.u);
                if (Math.hypot(on.x - p.x, on.z - p.z) < 1) {
                    assert.ok(at.u < ROAD.edgeOffset - RAILWAY.clearance || at.u > track.wallOffsetAt(at.s) + RAILWAY.clearance, 'on the road');
                }
            }
            if (run.bridge && points.length > 2) {
                const k = Math.floor(points.length / 2);
                const straight = points[0].y + (points.at(-1).y - points[0].y) * (k / (points.length - 1));
                assert.ok(Math.abs(points[k].y - straight) < 1e-6, 'a bridge runs straight');
            }
            // A railway climbs gently: the bed is never steeper than the ground around it (within twice
            // its smoothing) makes it, and has no steps where the ground has none.
            const reach = 2 * Math.round(RAILWAY.smooth / RAILWAY.step / 2) + 1;
            const step = (k, key) => { return Math.abs(points[k][key] - points[k - 1][key]) / Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z); };
            for (let k = 1; k < points.length && !run.bridge; k++) {
                const around = points.slice(Math.max(1, k - reach), k + reach + 1).map((_, j) => { return step(Math.max(1, k - reach) + j, 'ground'); });
                assert.ok(step(k, 'y') <= 2 * Math.max(...around) + 1e-6, `a ${(step(k, 'y') * 100).toFixed(0)}% step`);
            }
        }
    }
});
