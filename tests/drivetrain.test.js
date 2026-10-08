import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, carById } from '../src/data/cars.js';
import { PHYS } from '../src/config.js';
import { Drivetrain } from '../src/sim/Drivetrain.js';

const mph = (v) => {
    return v / PHYS.mph;
};

for (const car of CARS) {
    test(`${car.id}: 0-60 mph matches the brochure`, () => {
        const drivetrain = new Drivetrain(car);
        const { time } = drivetrain.simulateLaunch(60 * PHYS.mph);
        assert.ok(Math.abs(time - car.targets.zeroToSixty) < 0.15, `0-60 took ${time.toFixed(2)}s`);
    });

    test(`${car.id}: reaches its published top speed in top gear`, () => {
        const drivetrain = new Drivetrain(car);
        const { time } = drivetrain.simulateLaunch(car.targets.topMph * 0.97 * PHYS.mph, 300);
        assert.ok(time < 300, 'never reached 97% of top speed');
        const rpm = drivetrain.rpmAtSpeed(car.targets.topMph * PHYS.mph, drivetrain.gearCount);
        assert.ok(rpm < car.engine.redline, `top speed needs ${rpm.toFixed(0)} rpm`);
    });
}

test('porsche shifts 1-2 and 2-3 where the original brochure graph shows them', () => {
    const { shifts } = new Drivetrain(carById('porsche')).simulateLaunch(100 * PHYS.mph);
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
