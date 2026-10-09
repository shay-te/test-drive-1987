import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../src/data/stages.js';
import { GAME, PHYS, POLICE, ROAD } from '../src/config.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { TrafficManager, LANE, ONCOMING, SAME_WAY } from '../src/sim/Traffic.js';
import { PoliceManager, POLICE_EVENT } from '../src/sim/Police.js';

const stage = STAGES[0];
const track = buildTrack(stage);

/** Drives a player past the first trap at `mph`, then at whatever speed `drive(t, police, player)`
 *  returns (mph along the road, negative going back, or null to keep going); returns the events seen,
 *  the strongest detector signal and the managers. */
function passTrap(mph, seconds = 90, drive = () => { return null; }) {
    const traffic = new TrafficManager(track, stage);
    const police = new PoliceManager(track, traffic);
    police.populate();
    const trap = track.traps[0];
    const player = { s: trap.s - 300, u: LANE, speed: mph * PHYS.mph, mph, dir: SAME_WAY };
    const events = [];
    let maxSignal = 0;
    for (let t = 0; t < seconds; t += 1 / 30) {
        const along = drive(t, police, player) ?? Math.sign(player.speed) * player.mph;
        player.mph = Math.abs(along);
        player.speed = along * PHYS.mph;
        if (Math.abs(player.speed) > GAME.pullAwaySpeed) player.dir = Math.sign(player.speed);
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
    assert.ok(cars.length >= 2, 'patrol cars across the road');
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

test('the roadblock closes the whole road: no line from the edge to the cut gets a car past it', () => {
    const { police, traffic } = passTrap(95, 120);
    const { s } = police.roadblock;
    const half = 0.9;
    for (let u = ROAD.edgeOffset + half; u <= track.wallOffsetAt(s) - half; u += 0.1) {
        const hit = traffic.collision(s, u);
        assert.ok(hit && hit.type === 'police', `a gap at u=${u.toFixed(1)}`);
    }
});

/** Flees at 95 mph until the roadblock is in sight, brakes to a stop, turns round and flees back at
 *  `back` mph (negative), then does whatever `then(t, police, player)` says (mph, or null). */
const turnBack = (back, log, then = () => { return null; }) => {
    let phase = 'flee';
    let along = 95;
    return (t, police, player) => {
        const rb = police.roadblock;
        if (phase === 'flee' && rb && rb.s - player.s < POLICE.roadblockReach + 50) {
            phase = 'turn';
            log.first = { ...rb };
        }
        if (phase === 'turn') {
            along = Math.max(back, along - (along > 0 ? POLICE.brake : 4) / 30);
            if (along === back) phase = 'away';
        }
        if (phase === 'away') return then(t, police, player) ?? along;
        return along;
    };
};

test('turned back at the roadblock, the driver is followed the other way and a roadblock goes up ahead of them', () => {
    const log = { turnedAt: null, raised: null };
    const watch = (t, police, player) => {
        const cop = police.pursuer;
        if (cop?.dir === ONCOMING && log.turnedAt === null) log.turnedAt = { t, gap: cop.s - player.s };
        if (police.roadblock?.dir === ONCOMING && log.raised === null) log.raised = { ...police.roadblock, from: player.s, t };
        if (log.first && police.roadblock?.s === log.first.s) {
            assert.ok(Math.abs(log.first.s - player.s) <= POLICE.outOfSight + 60, 'the roadblock left while still in sight');
        }
        return log.raised && player.s - log.raised.s < POLICE.roadblockReach / 2 ? 0 : null;
    };
    const { events, police } = passTrap(95, 400, turnBack(-95, log, watch));
    assert.ok(log.turnedAt, 'the patrol car turned round');
    assert.ok(log.turnedAt.gap >= POLICE.followGap - 1e-6, 'and follows behind the driver');
    assert.ok(log.raised, 'a roadblock went up the other way');
    assert.ok(log.raised.from - log.raised.s >= POLICE.lead, 'well ahead of the car');
    const sight = (95 * PHYS.mph) ** 2 / (2 * POLICE.brake) + POLICE.margin;
    for (let at = log.raised.s; at <= log.raised.s + sight; at += track.segment) {
        const radius = 1 / Math.max(1e-9, Math.abs(track.curvatureAt(at)));
        assert.ok(2 * Math.sqrt(2 * radius * POLICE.sightClearance) >= sight - 1e-6, `a blind bend ${(at - log.raised.s).toFixed(0)} m before it`);
    }
    assert.equal(police.traffic.vehicles.filter((v) => { return Math.abs(v.s - log.first.s) < 1; }).length, 0, 'the first roadblock is gone');
    assert.deepEqual(events.slice(0, 3), [POLICE_EVENT.pursuit, POLICE_EVENT.failedToStop, POLICE_EVENT.roadblock]);
    assert.equal(events.at(-1), POLICE_EVENT.arrested, 'stopping at the new roadblock is an arrest');
});

test('turned back, a car fast enough loses the patrol car stuck turning round: no roadblock is left on the road', () => {
    const log = {};
    const { events, police } = passTrap(95, 200, turnBack(-140, log));
    assert.deepEqual(events, [POLICE_EVENT.pursuit, POLICE_EVENT.failedToStop, POLICE_EVENT.roadblock, POLICE_EVENT.escaped]);
    assert.equal(police.roadblock, null, 'the officers left the roadblock');
    assert.equal(police.roadblockDue, null, 'and set up no other');
    assert.equal(police.traffic.vehicles.filter((v) => { return v.type === 'police' && Math.abs(v.s - log.first.s) < 1; }).length, 0);
});

test('the patrol car turning round swings across the road, braking first', () => {
    const traffic = new TrafficManager(track, stage);
    const police = new PoliceManager(track, traffic);
    const cop = traffic.add('police', { s: 3000, u: LANE, dir: SAME_WAY, speed: 20, siren: true, chaseTime: 0, signalled: 0, turning: null });
    Object.assign(police, { pursuer: cop, fleeing: true });
    const player = { s: 2900, u: -LANE, speed: -20, mph: 20 / PHYS.mph, dir: ONCOMING };
    let yaw = 0;
    for (let t = 0; t < 15 && cop.dir === SAME_WAY; t += 1 / 30) {
        police.update(1 / 30, player);
        if (cop.speed > 0) assert.equal(cop.turning, null, 'it stops before it turns');
        yaw = Math.max(yaw, cop.yaw ?? 0);
    }
    assert.equal(cop.dir, ONCOMING);
    assert.ok(yaw > 3, 'it swings round');
    assert.equal(cop.yaw, 0);
    assert.ok(Math.abs(cop.u + LANE) < 1e-6, 'into the lane going the other way');
});
