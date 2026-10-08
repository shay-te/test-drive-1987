import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, ROAD } from '../src/config.js';
import { carById } from '../src/data/cars.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape } from '../src/sim/Landscape.js';
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

test('the ground is the road on the road and falls away past the edge', () => {
    const s = track.startS + 500;
    const road = track.elevationAt(s);
    const at = (u) => {
        const p = track.toWorld(s, u);
        return landscape.heightAt(p.x, p.z);
    };
    assert.ok(Math.abs(at(0) - road) < 0.02);
    assert.ok(Math.abs(at(ROAD.edgeOffset + 0.01) - at(ROAD.edgeOffset - 0.01)) < 0.2, 'step at the edge');
    assert.ok(at(ROAD.edgeOffset - 44) < road - 110, 'the drop is not deep');
    // Beyond the foot of the drop the valley side keeps going down, with no ditch to land in.
    assert.ok(at(-90) < at(-56) + 1, `ditch at the foot: ${at(-56)} then ${at(-90)}`);
});

test('a car driven over the edge tumbles to the valley floor and stops', () => {
    let i = Math.floor(track.startS / track.segment) + 60;
    while (track.rail[i] || track.rail[i + 5] || track.rail[i + 10]) i++;
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(i * track.segment, -3);
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
    assert.ok(fall.drop > 200, `only fell ${fall.drop.toFixed(0)} m`);
    assert.ok(tilt > Math.PI / 2, 'the car never turned over');
    // No energy from nowhere: never faster than falling the whole height from the launch speed.
    assert.ok(fall.topSpeed <= Math.sqrt(launch * launch + 2 * PHYS.g * fall.drop) + 1);
    assert.ok(fall.deepestCrush < 1.5, `sank ${fall.deepestCrush.toFixed(2)} m into the ground`);
});
