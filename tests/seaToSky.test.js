import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEA_TO_SKY } from '../src/data/seaToSky.js';
import { STAGES } from '../src/data/stages.js';
import { ROAD } from '../src/config.js';
import { Landscape, SEA_DEPTH, SEA_LEVEL } from '../src/sim/Landscape.js';
import { roadsideAt } from '../src/sim/routeTerrain.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { latLonOf, worldOf } from '../src/world/routeFrame.js';
import { sunDirection } from '../src/world/sunDirection.js';

const tracks = STAGES.map(buildTrack);

test('the five stages are one drive up the highway, each starting where the last one ended', () => {
    STAGES.forEach((stage, i) => {
        const track = tracks[i];
        assert.equal(track.routeStart + track.startS / track.segment, stage.startNode);
        if (i > 0) assert.equal(stage.startNode, STAGES[i - 1].startNode + STAGES[i - 1].segments);
        assert.ok(stage.startNode + stage.segments < SEA_TO_SKY.curvature.length, 'the last stage ends before the mapped road does');
    });
    const finish = tracks.at(-1);
    assert.ok(finish.elevationAt(finish.finishS) < 30, 'Squamish lies at the head of the sound, by the sea');
});

test('each stage carries on the real road: its curvature and height are the route\'s, its bearing where the road points', () => {
    for (const track of tracks) {
        const node = track.routeStart + 100;
        assert.equal(track.curvature[100], Math.fround(SEA_TO_SKY.curvature[node]));
        assert.equal(track.elevation[100], Math.fround(SEA_TO_SKY.elevation[node]));
    }
    // Leaving the Horseshoe Bay interchange the highway climbs away north-north-east.
    assert.ok(tracks[0].bearing > 20 && tracks[0].bearing < 45, `starts on ${tracks[0].bearing.toFixed(0)} deg`);
    for (let i = 1; i < tracks.length; i++) {
        const before = tracks[i - 1];
        const end = before.headingAt(before.startS + STAGES[i - 1].segments * before.segment);
        const turned = (tracks[i].bearing - before.bearing) * (Math.PI / 180);
        const startHeading = tracks[i].headingAt(tracks[i].startS) + turned;
        assert.ok(Math.abs(startHeading - end) < 1e-3, `stage ${i + 1} picks up the road's heading`);
    }
});

test('Howe Sound lies on the left of the northbound road and the mountains on the right', () => {
    const { sectionOffsets: offsets, sections } = SEA_TO_SKY;
    const left = offsets.indexOf(-300);
    const right = offsets.indexOf(300);
    const far = offsets.indexOf(1200);
    const rows = sections.length / offsets.length;
    // Along the sound: from Horseshoe Bay to the end of the fourth stage, past Britannia Beach.
    const sound = Math.floor((STAGES[3].startNode + STAGES[3].segments) / SEA_TO_SKY.sectionStep);
    let sea = 0;
    let climbing = 0;
    for (let row = 0; row < sound; row++) {
        const at = (column) => { return sections[row * offsets.length + column]; };
        if (at(left) <= SEA_LEVEL) sea++;
        if (at(far) > at(right)) climbing++;
        assert.ok(at(right) > SEA_LEVEL, 'no sea on the mountain side');
    }
    assert.ok(sea > sound * 0.6, `the sea is 300 m to the left only ${((100 * sea) / sound).toFixed(0)}% of the way`);
    assert.ok(climbing > sound * 0.8, 'the mountains climb away to the right');
    assert.ok(rows > sound);
});

test('the late-afternoon sun stands in the west, on the left as each stage sets off north, and sinks stage by stage', () => {
    STAGES.forEach((stage, i) => {
        const sun = sunDirection(stage.sun, tracks[i].bearing);
        assert.ok(Math.abs(Math.hypot(sun.x, sun.y, sun.z) - 1) < 1e-9);
        assert.ok(stage.sun.azimuth > 225 && stage.sun.azimuth < 315, 'in the west');
        assert.ok(sun.x < 0, `stage ${i + 1}: the sun is on the left`);
        if (i > 0) assert.ok(stage.sun.elevation < STAGES[i - 1].sun.elevation, 'lower each stage');
    });
});

test('the rock face is the real cut: tall where the mountain was blasted, a low bank where the side is flat', () => {
    const track = tracks[2];
    const bank = Math.fround(1.2);
    const heights = Array.from(track.wallHeight.subarray(track.startS / track.segment, track.finishS / track.segment));
    assert.ok(Math.max(...heights) > 25, `tallest cut ${Math.max(...heights).toFixed(0)} m`);
    assert.ok(Math.min(...heights) === bank, 'a bank where nothing rises beside the road');
    for (let i = 0; i < track.count; i += 97) {
        if (track.wallHeight[i] > bank) {
            const top = roadsideAt(track, i, 1, track.wallSetback[i] + track.wallTop[i]);
            assert.ok(Math.abs(track.wallHeight[i] - top) < 1e-3, 'up to the real top of the cut');
            assert.ok(track.wallSetback[i] <= 9, 'its foot not far from the road');
        }
    }
});

test('the drop beyond the edge is the real ground, down to the shore', () => {
    const track = tracks[2];
    const landscape = new Landscape(track, STAGES[2]);
    let checked = 0;
    for (let i = 0; i < track.count; i += 53) {
        const section = landscape.dropSections[i];
        for (const { u, h } of section.slice(0, -1)) {
            const real = roadsideAt(track, i, -1, ROAD.edgeOffset - u);
            if (track.elevation[i] + real > SEA_LEVEL) {
                assert.ok(Math.abs(h - real) < 1e-6, `node ${i}, ${u} m`);
                checked++;
            }
        }
    }
    assert.ok(checked > 100);
});

test('the sea floor shelves gently away from the shore, never deeper than the sound is drawn', () => {
    const landscape = new Landscape(tracks[0], STAGES[0]);
    const { heights, nx, cell } = landscape;
    let sea = 0;
    let steepest = 0;
    for (let k = 0; k < heights.length - nx - 1; k++) {
        if (heights[k] > SEA_LEVEL) continue;
        sea++;
        assert.ok(heights[k] >= SEA_LEVEL - SEA_DEPTH - 1e-6);
        for (const n of [k + 1, k + nx]) if (heights[n] <= SEA_LEVEL) steepest = Math.max(steepest, Math.abs(heights[n] - heights[k]) / cell);
    }
    assert.ok(sea > 1000, 'Howe Sound is there');
    assert.ok(steepest <= 0.5 + 1e-6, `a sunk car could not settle on ${steepest.toFixed(2)}`);
});

test('each stage knows where it lies on the map: Horseshoe Bay at the start, Squamish at the finish', () => {
    const first = tracks[0];
    const start = first.toWorld(first.startS, 0);
    const [lat0, lon0] = latLonOf(first, start.x, start.z);
    assert.ok(Math.abs(lat0 - 49.369) < 0.003 && Math.abs(lon0 - -123.27) < 0.004, `starts at ${lat0.toFixed(4)}, ${lon0.toFixed(4)}`);
    const last = tracks.at(-1);
    const finish = last.toWorld(last.finishS, 0);
    const [lat, lon] = latLonOf(last, finish.x, finish.z);
    assert.ok(lat > 49.69 && lat < 49.72 && lon > -123.16 && lon < -123.13, `finishes at ${lat.toFixed(4)}, ${lon.toFixed(4)} (Squamish)`);
    const back = worldOf(last, lat, lon);
    assert.ok(Math.hypot(back.x - finish.x, back.z - finish.z) < 1e-6, 'map and world are each other\'s inverse');
});

test('where one stage ends and the next begins, both put the road on the same spot on the map', () => {
    for (let i = 1; i < tracks.length; i++) {
        const before = tracks[i - 1];
        const after = tracks[i];
        const end = before.toWorld(before.startS + STAGES[i - 1].segments * before.segment, 0);
        const begin = after.toWorld(after.startS, 0);
        const [a, b] = [latLonOf(before, end.x, end.z), latLonOf(after, begin.x, begin.z)];
        const metres = Math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 72410);
        assert.ok(metres < 0.5, `stage ${i + 1} starts ${metres.toFixed(2)} m from where stage ${i} ended`);
    }
});
