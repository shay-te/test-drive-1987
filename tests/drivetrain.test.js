import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, carById } from '../src/data/cars.js';
import { PHYS } from '../src/config.js';
import { Drivetrain } from '../src/sim/Drivetrain.js';

const mph = (v) => {
    return v / PHYS.mph;
};

/** How close the simulated road test must come to each brochure figure (s, s, s, mph). */
const TOLERANCE = { zeroToSixty: 0.3, zeroToHundred: 0.7, quarterMile: 0.2, trapMph: 2 };

for (const car of CARS) {
    test(`${car.id}: the road test matches the brochure's 0-60, 0-100 and quarter mile`, () => {
        const targets = car.targets;
        const run = new Drivetrain(car).roadTest(30);
        const measured = {
            zeroToSixty: run.timeTo(60 * PHYS.mph),
            zeroToHundred: run.timeTo(100 * PHYS.mph),
            quarterMile: run.quarter.time,
            trapMph: mph(run.quarter.speed),
        };
        for (const [figure, tolerance] of Object.entries(TOLERANCE)) {
            const miss = measured[figure] - targets[figure];
            assert.ok(Math.abs(miss) < tolerance, `${figure} ${measured[figure].toFixed(2)} against ${targets[figure]}`);
        }
    });

    test(`${car.id}: reaches its published top speed in top gear`, () => {
        const drivetrain = new Drivetrain(car);
        const run = drivetrain.roadTest(300, car.targets.topMph * 0.97 * PHYS.mph);
        assert.ok(run.trace.at(-1)[0] < 300, 'never reached 97% of top speed');
        const rpm = drivetrain.rpmAtSpeed(car.targets.topMph * PHYS.mph, drivetrain.gearCount);
        assert.ok(rpm < car.engine.redline, `top speed needs ${rpm.toFixed(0)} rpm`);
    });

    test(`${car.id}: the engine never makes more than its rated power`, () => {
        const drivetrain = new Drivetrain(car);
        let peak = 0;
        for (let rpm = car.engine.idleRpm; rpm <= car.engine.maxRpm; rpm += 50) {
            const lbft = drivetrain.baseTorque(rpm) / PHYS.lbftToNm / drivetrain.torqueFactor;
            peak = Math.max(peak, (lbft * rpm) / PHYS.lbftRpmPerHp);
        }
        // The smooth knots round the peak off a percent or two high; a curve still climbing past it would not.
        assert.ok(peak < car.engine.hp * 1.03, `${peak.toFixed(0)} hp against ${car.engine.hp}`);
    });
}

test('porsche shifts 1-2 and 2-3 where the original brochure graph shows them', () => {
    const { shifts } = new Drivetrain(carById('porsche')).roadTest(30, 100 * PHYS.mph);
    assert.ok(Math.abs(mph(shifts[0].v) - 52) < 3, `1-2 at ${mph(shifts[0].v).toFixed(0)} mph`);
    assert.ok(Math.abs(mph(shifts[1].v) - 89) < 3, `2-3 at ${mph(shifts[1].v).toFixed(0)} mph`);
});

test('downshifting into first at 100 mph blows the engine', () => {
    const drivetrain = new Drivetrain(carById('ferrari'));
    const state = drivetrain.createState();
    state.gear = 2;
    drivetrain.shift(state, -1);
    for (let i = 0; i < 60; i++) drivetrain.update(state, 100 * PHYS.mph, 0, 1 / 60);
    assert.equal(state.blown, true);
});

test('holding the engine in the red long enough blows it, short revs do not', () => {
    const drivetrain = new Drivetrain(carById('corvette'));
    const state = drivetrain.createState();
    state.gear = 1;
    const v = drivetrain.speedAtRpm(drivetrain.engine.redline + 400, 1);
    for (let i = 0; i < 60; i++) drivetrain.update(state, v, 1, 1 / 60);
    assert.equal(state.blown, false, 'one second over the redline must survive');
    for (let i = 0; i < 240; i++) drivetrain.update(state, v, 1, 1 / 60);
    assert.equal(state.blown, true);
});

test('turbo boost lags behind the throttle', () => {
    const drivetrain = new Drivetrain(carById('porsche'));
    const state = drivetrain.createState();
    state.gear = 3;
    const v = drivetrain.speedAtRpm(4500, 3);
    drivetrain.update(state, v, 1, 0.2);
    assert.ok(state.boost < 0.4, `boost ${state.boost.toFixed(2)} after 0.2 s`);
    for (let i = 0; i < 40; i++) drivetrain.update(state, v, 1, 0.1);
    assert.ok(state.boost > 0.9, `boost ${state.boost.toFixed(2)} after 4 s`);
});
