import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/data/stages.js';
import { PHYS } from '../src/config.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { TrafficManager, LANE } from '../src/sim/Traffic.js';
import { PoliceManager, POLICE_EVENT } from '../src/sim/Police.js';

const stage = STAGES[0];
const track = buildTrack(stage);

/** Drives a constant-speed player past the first trap; returns the police events seen. */
function passTrap(mph, seconds = 90) {
    const traffic = new TrafficManager(track, stage);
    const police = new PoliceManager(track, traffic);
    police.populate();
    const trap = track.traps[0];
    const player = { s: trap.s - 300, u: LANE, speed: mph * PHYS.mph, mph };
    const events = [];
    let maxSignal = 0;
    for (let t = 0; t < seconds; t += 1 / 30) {
        player.s += player.speed / 30;
        maxSignal = Math.max(maxSignal, police.radarSignal(player));
        const event = police.update(1 / 30, player);
        if (event) events.push(event);
        if (event === POLICE_EVENT.pulledOver || event === POLICE_EVENT.escaped) break;
    }
    return { events, maxSignal };
}

test('passing a trap at the speed limit draws no pursuit', () => {
    const { events, maxSignal } = passTrap(55, 20);
    assert.deepEqual(events, []);
    assert.ok(maxSignal > 0.5, 'the radar detector should still warn of the trap');
});

test('speeding past a trap at 95 mph gets you pulled over', () => {
    const { events } = passTrap(95);
    assert.deepEqual(events, [POLICE_EVENT.pursuit, POLICE_EVENT.pulledOver]);
});

test('holding 130 mph outruns the patrol car', () => {
    const { events } = passTrap(130);
    assert.deepEqual(events, [POLICE_EVENT.pursuit, POLICE_EVENT.escaped]);
});

test('traffic fills both lanes and keeps its distance', () => {
    const traffic = new TrafficManager(track, stage);
    traffic.populate(track.startS);
    for (let t = 0; t < 60; t += 1 / 30) traffic.update(1 / 30, track.startS + t * 30);
    const lanes = new Set(
        traffic.vehicles.map((v) => {
            return v.dir;
        }),
    );
    assert.equal(lanes.size, 2);
    for (const a of traffic.vehicles) {
        for (const b of traffic.vehicles) {
            if (a === b || a.dir !== b.dir) continue;
            assert.ok(Math.abs(a.s - b.s) > (a.length + b.length) / 2, 'vehicles overlap');
        }
    }
});
