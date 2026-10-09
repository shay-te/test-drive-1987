import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, ROAD } from '../src/config.js';
import { carById } from '../src/data/cars.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape, SEA_DEPTH, SEA_LEVEL } from '../src/sim/Landscape.js';
import { OverTheEdge } from '../src/sim/OverTheEdge.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { VehicleDynamics } from '../src/sim/VehicleDynamics.js';
import { rotate } from '../src/util/quaternion.js';

const stage = STAGES[0];
const track = buildTrack(stage);
const landscape = new Landscape(track, stage);

test('projecting a world point gives back its road position', () => {
    for (const [s, u] of [
        [track.startS + 100, 1.8],
        [track.startS + 900, -4],
        [track.startS + 2000, -30],
    ]) {
        const p = track.toWorld(s, u);
        const back = track.project(p.x, p.z, 0);
        assert.ok(
            Math.abs(back.s - s) < 0.5 && Math.abs(back.u - u) < 0.5,
            `${s},${u} -> ${back.s},${back.u}`,
        );
    }
});

/** Ground height at road position (s, u). */
const ground = (s, u) => {
    const p = track.toWorld(s, u);
    return landscape.heightAt(p.x, p.z);
};
/** The drop's foot, 44 m out from the edge. */
const FOOT = ROAD.edgeOffset - 44;
/** The deepest drop on the stage without a guard rail: the node where the real ground at the drop's
 *  foot lies furthest below the road. */
const deepDrop = (() => {
    let deepest = null;
    let depth = -Infinity;
    for (let i = Math.floor(track.startS / track.segment) + 60; i < track.finishS / track.segment; i += 5) {
        if (track.rail[i] || track.rail[i + 5] || track.rail[i + 10]) continue;
        const below = track.elevation[i] - ground(i * track.segment, FOOT);
        if (below > depth) [deepest, depth] = [i, below];
    }
    return deepest;
})();

test('the ground is the road on the road and falls away past the edge to the real ground', () => {
    const s = deepDrop * track.segment;
    const road = track.elevationAt(s);
    assert.ok(Math.abs(ground(s, 0) - road) < 0.02);
    assert.ok(Math.abs(ground(s, ROAD.edgeOffset + 0.01) - ground(s, ROAD.edgeOffset - 0.01)) < 0.2, 'step at the edge');
    assert.ok(ground(s, FOOT) < road - 40, 'the drop is not deep');
});

test('past the foot of the drop the ground runs on, with no trench dug along it', () => {
    for (let s = track.startS; s < track.finishS; s += 40) {
        const foot = ground(s, FOOT);
        // Relief on the rock and the step from the shore to the sea floor are the only ways down.
        const lowest = Math.min(foot, SEA_LEVEL - SEA_DEPTH) - 6;
        for (const u of [-56, -62, -70]) assert.ok(ground(s, u) > lowest, `${(foot - ground(s, u)).toFixed(0)} m trench at s=${s}`);
    }
});

test('the ground steps up to the rock face exactly where it is drawn, between nodes too', () => {
    let i = Math.floor(track.startS / track.segment);
    while (Math.abs(track.wallOffset[i + 1] - track.wallOffset[i]) < 0.05) i++;
    const s = (i + 0.5) * track.segment;
    const face = track.wallOffsetAt(s) + 0.4;
    const road = track.elevationAt(s);
    // Projecting back onto a bend is good to a centimetre or so; the old step at the nodes was off by more.
    assert.ok(ground(s, face - 0.05) < road, 'the shoulder runs right up to the face');
    assert.ok(ground(s, face + 0.05) > road + track.wallHeightAt(s) - 0.5, 'and the rock rises from it');
});

test('a car driven over the edge tumbles down to the ground below and stops', () => {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(deepDrop * track.segment, -3);
    vehicle.engine.gear = 3;
    vehicle.vx = 25;
    vehicle.theta = -0.25;
    let event = null;
    for (let k = 0; k < 1200 && !event; k++)
        event = vehicle.step(1 / 120, { steer: 0, throttle: 0.3, brake: 0 }, track);
    assert.equal(event?.cause, 'edge');

    const fall = new OverTheEdge(vehicle, track, landscape);
    const launch = fall.body.speed;
    let tilt = 0;
    while (!fall.done) {
        fall.update(1 / 60);
        tilt = Math.max(tilt, Math.acos(Math.min(1, rotate(fall.body.orientation, { x: 0, y: 1, z: 0 }).y)));
    }
    assert.ok(fall.still > 0, 'never came to rest');
    assert.ok(fall.drop > 30, `only fell ${fall.drop.toFixed(0)} m`);
    assert.ok(tilt > Math.PI / 2, 'the car never turned over');
    // No energy from nowhere: never faster than falling the whole height from the launch speed.
    assert.ok(fall.topSpeed <= Math.sqrt(launch * launch + 2 * PHYS.g * fall.drop) + 1);
    assert.ok(fall.deepestCrush < 1.5, `sank ${fall.deepestCrush.toFixed(2)} m into the ground`);
});
