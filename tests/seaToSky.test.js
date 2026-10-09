import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEA_TO_SKY } from '../src/data/seaToSky.js';
import { STAGES } from '../src/data/stages.js';
import { SEA_LEVEL } from '../src/sim/Landscape.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
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
