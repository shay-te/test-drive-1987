import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../src/data/cars.js';
import { GAME, PHYS, POLICE } from '../src/config.js';
import { CRASH_CAUSE, Session } from '../src/sim/Session.js';

test('a speeding ticket costs the time it takes to be written, not a chance', () => {
    const session = new Session(CARS[0]);
    session.beginStage();
    session.tick(100);
    session.recordTicket();
    assert.equal(session.chances, GAME.chances);
    assert.equal(session.elapsed, 100 + POLICE.ticketSeconds);
    assert.equal(session.over, false);
});

test('an arrest for failing to stop is jail: the run is over', () => {
    const session = new Session(CARS[0]);
    session.recordArrest();
    assert.equal(session.arrested, true);
    assert.equal(session.over, true);
});

test('five crashes end the run, ramming a patrol car ends it at once', () => {
    const session = new Session(CARS[0]);
    for (let i = 0; i < GAME.chances - 1; i++) assert.equal(session.recordCrash(CRASH_CAUSE.wall), false);
    assert.equal(session.recordCrash(CRASH_CAUSE.edge), true);

    const other = new Session(CARS[0]);
    assert.equal(other.recordCrash(CRASH_CAUSE.police), true);
    assert.equal(other.chances, GAME.chances - 1);
});

test('faster stages score more points', () => {
    const score = (seconds) => {
        const session = new Session(CARS[0]);
        session.beginStage();
        session.tick(seconds);
        return session.finishStage(6000).points;
    };
    assert.ok(score(150) > score(200));
});

test('the stage result reports average speed in mph', () => {
    const session = new Session(CARS[0]);
    session.beginStage();
    session.tick(100);
    const result = session.finishStage(100 * 50 * PHYS.mph);
    assert.ok(Math.abs(result.avgMph - 50) < 1e-9);
});
