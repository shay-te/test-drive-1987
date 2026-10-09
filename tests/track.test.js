import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/data/stages.js';
import { ROAD } from '../src/config.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';

/** Road this far apart along the stage must stay this far apart on the ground (m), so the scenery of one
 *  stretch never lands on another. */
const ALONG = 1000;
const APART = 400;

for (const [index, stage] of STAGES.entries()) {
    test(`stage ${index + 1}: geometry is finite and the road never comes back near itself`, () => {
        const track = buildTrack(stage);
        for (const array of [track.px, track.pz, track.elevation, track.heading, track.wallOffset]) {
            assert.ok(array.every(Number.isFinite));
        }
        const skip = ALONG / track.segment;
        for (let i = 0; i < track.count; i += 5) {
            for (let j = i + skip; j < track.count; j += 5) {
                const apart = Math.hypot(track.px[i] - track.px[j], track.pz[i] - track.pz[j]);
                assert.ok(apart > APART, `nodes ${i} and ${j} are ${apart.toFixed(0)} m apart`);
            }
        }
        assert.ok(
            track.wallOffset.every((w) => {
                return w >= ROAD.halfWidth + 1;
            }),
        );
    });

    test(`stage ${index + 1}: is deterministic for its seed`, () => {
        const a = buildTrack(stage);
        const b = buildTrack(stage);
        assert.deepEqual(a.curvature, b.curvature);
        assert.deepEqual(a.traps, b.traps);
    });

    test(`stage ${index + 1}: has traps inside the stage and the right finish`, () => {
        const track = buildTrack(stage);
        assert.equal(track.traps.length, stage.traps);
        for (const trap of track.traps) assert.ok(trap.s > track.startS && trap.s < track.finishS);
        const finishType = stage.summit ? 'dealership' : 'station';
        assert.ok(
            track.props.some((p) => {
                return p.type === finishType && p.s >= track.finishS;
            }),
        );
    });
}

test('toWorld follows the heading of the road', () => {
    const track = buildTrack(STAGES[2]);
    const s = 2000;
    const here = track.toWorld(s, 0);
    const ahead = track.toWorld(s + 1, 0);
    const right = track.toWorld(s, 1);
    assert.ok(Math.abs(Math.hypot(ahead.x - here.x, ahead.z - here.z) - 1) < 0.01);
    const forward = [Math.sin(here.heading), -Math.cos(here.heading)];
    const side = [right.x - here.x, right.z - here.z];
    assert.ok(Math.abs(forward[0] * side[0] + forward[1] * side[1]) < 1e-6, 'u must be perpendicular');
});
