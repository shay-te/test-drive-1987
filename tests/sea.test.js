import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRASH, FALL, WATER } from '../src/config.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape } from '../src/sim/Landscape.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { WaterParticles } from '../src/sim/WaterParticles.js';
import { diverPose } from '../src/world/chaseView.js';
import { fishSchool } from '../src/world/fishSchool.js';
import { findPlunge } from './helpers/plunge.js';

const stage = STAGES[2];
const track = buildTrack(stage);
const landscape = new Landscape(track, stage);
const sea = landscape.waterLevel;

const plunge = findPlunge(track, landscape, 10);

test('a car driven off the edge above Howe Sound splashes in, floats while it fills, then sinks to the bottom', () => {
    const { event, fall, log } = plunge;
    assert.equal(event?.cause, 'edge');
    assert.ok(log.splash > 5, `went in at ${log.splash.toFixed(1)} m/s`);
    assert.ok(log.underAt - log.splashAt > 2, 'it floats a while as the water pours in');
    assert.ok(log.underAt - log.splashAt < WATER.floodSeconds + 2, 'and goes under once it has filled');
    assert.ok(fall.body.flooded === 1, 'full of water');
    assert.ok(fall.still >= FALL.restSeconds && fall.time < FALL.maxSeconds, 'it settles on the sea floor');
    assert.ok(fall.underwater && fall.sank > 10, `${fall.sank.toFixed(1)} m down`);
    const air = fall.body.volume * WATER.airShare;
    assert.ok(Math.abs(log.air - air) < air * 0.01, 'all the air inside comes out');
});

test('the splash throws drops up that fall back into the sea', () => {
    const water = new WaterParticles(sea, 1);
    water.splash({ x: 0, y: sea, z: 0 }, 15);
    assert.equal(water.drops.length, Math.round(15 * WATER.splashPerSpeed));
    let top = sea;
    for (let t = 0; t < 3; t += 1 / 60) {
        water.update(1 / 60);
        for (const d of water.drops) top = Math.max(top, d.y);
    }
    assert.ok(top > sea + 1, 'spray rises above the water');
    assert.equal(water.drops.length, 0, 'and all of it falls back in');
});

test('air leaving a sunk car rises as bubbles that swell on the way up and burst at the surface', () => {
    const water = new WaterParticles(sea, 2);
    water.bubble({ x: 0, y: sea - 15, z: 0 }, 0.5);
    assert.equal(water.bubbles.length, Math.floor(0.5 * WATER.bubblesPerAir));
    const first = water.bubbles[0];
    const size = first.size;
    for (let t = 0; t < 5; t += 1 / 60) water.update(1 / 60);
    assert.ok(first.y > sea - 15 + 2 && first.size > size, 'rising and swelling');
    for (let t = 0; t < 40; t += 1 / 60) water.update(1 / 60);
    assert.equal(water.bubbles.length, 0, 'every bubble reaches the surface');
    water.bubble({ x: 0, y: sea - 5, z: 0 }, 0.004);
    water.bubble({ x: 0, y: sea - 5, z: 0 }, 0.004);
    assert.equal(water.bubbles.length, 0, 'a little air waits until there is a bubble\'s worth');
    water.bubble({ x: 0, y: sea - 5, z: 0 }, 0.01);
    assert.equal(water.bubbles.length, 1);
});

test('fish circle the sunk car, below the surface, swimming the way they face', () => {
    const car = { x: 10, y: sea - 18, z: -40 };
    const dt = 0.05;
    const now = fishSchool(car, 7, sea);
    const next = fishSchool(car, 7 + dt, sea);
    assert.equal(now.length, WATER.fish.count);
    now.forEach((fish, i) => {
        const across = Math.hypot(fish.x - car.x, fish.z - car.z);
        assert.ok(across >= WATER.fish.radius[0] - 1e-9 && across <= WATER.fish.radius[1] + 1e-9);
        assert.ok(fish.y < sea, 'under water');
        const moved = { x: next[i].x - fish.x, z: next[i].z - fish.z };
        const facing = { x: -Math.sin(fish.heading), z: -Math.cos(fish.heading) };
        assert.ok(moved.x * facing.x + moved.z * facing.z > 0.9 * Math.hypot(moved.x, moved.z), 'heads first');
        assert.ok(Math.abs(fish.tail) <= 1);
    });
    const shallow = fishSchool({ x: 0, y: sea - 0.5, z: 0 }, 3, sea);
    assert.ok(shallow.every((fish) => { return fish.y < sea; }), 'even round a car just under the surface');
});

test('under water the camera follows the car down from beyond it, looking back at it, never above the surface', () => {
    const from = { x: 0, y: 40, z: 0 };
    for (const car of [{ x: 30, y: sea - 18, z: 5 }, { x: 30, y: sea - 1.2, z: 5 }]) {
        const { position, aim } = diverPose(car, from, sea);
        assert.ok(position[1] <= sea - CRASH.diver.belowSurface);
        assert.deepEqual(aim, [car.x, car.y, car.z]);
        assert.ok(Math.hypot(position[0] - from.x, position[2] - from.z) > Math.hypot(car.x - from.x, car.z - from.z), 'beyond the car');
        assert.ok(Math.abs(Math.hypot(position[0] - car.x, position[2] - car.z) - CRASH.diver.distance) < 1e-9);
    }
});
