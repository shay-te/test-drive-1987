import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/data/stages.js';
import { PHYS, POLICE } from '../src/config.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { TrafficManager, LANE } from '../src/sim/Traffic.js';
import { PoliceManager, POLICE_EVENT } from '../src/sim/Police.js';

const stage = STAGES[0];
const track = buildTrack(stage);

/** Drives a player past the first trap at `mph`, then at whatever speed `drive(t, police, player)`
 *  returns (mph, or null to keep going); returns the events seen, the strongest detector signal and
 *  the managers. */
function passTrap(mph, seconds = 90, drive = () => { return null; }) {
    const traffic = new TrafficManager(track, stage);
    const police = new PoliceManager(track, traffic);
    police.populate();
    const trap = track.traps[0];
    const player = { s: trap.s - 300, u: LANE, speed: mph * PHYS.mph, mph };
    const events = [];
    let maxSignal = 0;
    for (let t = 0; t < seconds; t += 1 / 30) {
        player.mph = drive(t, police, player) ?? player.mph;
        player.speed = player.mph * PHYS.mph;
        player.s += player.speed / 30;
        maxSignal = Math.max(maxSignal, police.radarSignal(player));
        const event = police.update(1 / 30, player);
        if (event) events.push(event);
        if ([POLICE_EVENT.ticket, POLICE_EVENT.arrested, POLICE_EVENT.escaped].includes(event)) break;
    }
    return { events, maxSignal, police, traffic, player };
}

/** Pulls over (to a stop) once the patrol car is within `range` m behind, after `delay` s of it there. */
const pullOver = (range, delay = 0) => {
    let since = null;
    return (t, police, player) => {
        if (!police.pursuer || player.s - police.pursuer.s > range) return null;
        since ??= t;
        return t - since >= delay ? 0 : null;
    };
};

test('passing a trap at the speed limit draws no pursuit', () => {
    const { events, maxSignal } = passTrap(55, 20);
    assert.deepEqual(events, []);
    assert.ok(maxSignal > 0.5, 'the radar detector should still warn of the trap');
});

test('clocked at 95 mph, a driver who pulls over for the patrol car gets a speeding ticket', () => {
    const { events, police } = passTrap(95, 90, pullOver(POLICE.complyRange));
    assert.deepEqual(events, [POLICE_EVENT.pursuit, POLICE_EVENT.ticket]);
    assert.equal(police.fleeing, false);
});

test('a driver who does not stop is pursued: the officer radios for help and a roadblock goes up ahead, where there is room to stop', () => {
    let raisedAt = null;
    const watch = (t, p, car) => {
        if (p.roadblock?.s !== undefined && raisedAt === null) raisedAt = car.s;
        return null;
    };
    const { events, police } = passTrap(95, 120, watch);
    assert.deepEqual(events.slice(0, 3), [POLICE_EVENT.pursuit, POLICE_EVENT.failedToStop, POLICE_EVENT.roadblock]);
    const { s, cars } = police.roadblock;
    assert.equal(cars.length, POLICE.roadblockCars.length, 'patrol cars across the road');
    assert.ok(cars.every((car) => { return car.siren && car.speed === 0; }), 'parked with their lights on');
    // On a bend of radius R the road is seen about 2·sqrt(2·R·clearance) ahead: far enough to stop.
    const sight = (95 * PHYS.mph) ** 2 / (2 * POLICE.brake) + POLICE.margin;
    for (let at = s - sight; at <= s; at += track.segment) {
        const radius = 1 / Math.max(1e-9, Math.abs(track.curvatureAt(at)));
        assert.ok(2 * Math.sqrt(2 * radius * POLICE.sightClearance) >= sight - 1e-6, `a blind bend ${(s - at).toFixed(0)} m before it`);
    }
    assert.ok(s - raisedAt >= POLICE.lead, 'well ahead of the car when it went up');
});

test('stopping after failing to stop is an arrest, and so is stopping at the roadblock', () => {
    const failed = (t, police) => { return police.fleeing && police.pursuer ? 0 : null; };
    assert.deepEqual(passTrap(95, 120, failed).events, [POLICE_EVENT.pursuit, POLICE_EVENT.failedToStop, POLICE_EVENT.arrested]);
    const atRoadblock = (t, police, player) => {
        return police.roadblock?.s && police.roadblock.s - player.s < POLICE.roadblockReach / 2 ? 0 : null;
    };
    const { events } = passTrap(95, 300, atRoadblock);
    assert.equal(events.at(-1), POLICE_EVENT.arrested);
});

test('holding 130 mph outruns the patrol car', () => {
    const { events } = passTrap(130);
    assert.deepEqual(events, [POLICE_EVENT.pursuit, POLICE_EVENT.escaped]);
});

test('the patrol car follows, never passing, boxing in or ramming', () => {
    const { police, player } = passTrap(95, 60, () => { return null; });
    assert.ok(police.pursuer, 'still on the tail');
    assert.ok(player.s - police.pursuer.s >= POLICE.followGap - 1e-6, 'behind the car');
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
