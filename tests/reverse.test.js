import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME, ROAD } from '../src/config.js';
import { CARS, carById, gearLabel } from '../src/data/cars.js';
import { STAGES } from '../src/data/stages.js';
import { REVERSE } from '../src/sim/Drivetrain.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { VehicleDynamics } from '../src/sim/VehicleDynamics.js';
import { clamp, wrapAngle } from '../src/util/math.js';

const STEP = 1 / 120;
const track = buildTrack(STAGES[0]);
/** A straight on the first stage, clear of the start, to turn round on. */
const straight = (() => {
    for (let s = track.startS + 300; s < track.finishS; s += track.segment) {
        if (Math.abs(track.curvatureAt(s)) < 1e-4 && Math.abs(track.curvatureAt(s + 40)) < 1e-4) return s;
    }
    throw new Error('no straight');
})();

/** Runs `seconds` with `controls(vehicle)` ({ steer, throttle, brake }); returns the first crash event. */
function drive(vehicle, seconds, controls) {
    for (let t = 0; t < seconds; t += STEP) {
        const event = vehicle.step(STEP, controls(vehicle), track);
        if (event) return event;
    }
    return null;
}

/** Into reverse from first: through neutral, at a standstill. */
function intoReverse(vehicle) {
    const { drivetrain, engine } = vehicle;
    while (engine.gear > REVERSE) drivetrain.shift(engine, -1, vehicle.vx);
}

/** Pedals that hold a crawl of `speed` m/s (either way, up the grade too) with full `steer`. */
const crawl = (steer, speed = 2.5) => {
    return (v) => {
        return { steer, throttle: Math.abs(v.vx) < speed ? 0.7 : 0, brake: Math.abs(v.vx) > speed + 1 ? 0.5 : 0 };
    };
};
const stop = { steer: 0, throttle: 0, brake: 1 };

test('every car has its real reverse gear, below neutral, shown as R', () => {
    for (const car of CARS) {
        const vehicle = new VehicleDynamics(car);
        assert.ok(car.drivetrain.reverse > 1.5 && car.drivetrain.reverse < 3.5, `${car.id} reverse ${car.drivetrain.reverse}`);
        assert.ok(vehicle.drivetrain.ratio(REVERSE) < 0, `${car.id}: reverse turns the wheels backwards`);
        intoReverse(vehicle);
        assert.equal(vehicle.engine.gear, REVERSE);
        assert.equal(gearLabel(car, REVERSE), 'R');
    }
});

test('reverse goes in only at a standstill', () => {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(straight, ROAD.laneWidth / 2);
    vehicle.vx = 5;
    const { drivetrain, engine } = vehicle;
    assert.equal(engine.gear, 0);
    assert.equal(drivetrain.shift(engine, -1, vehicle.vx), false, 'no reverse while rolling at 5 m/s');
    assert.equal(engine.gear, 0);
    vehicle.vx = GAME.pullAwaySpeed / 2;
    assert.ok(drivetrain.shift(engine, -1, vehicle.vx));
    assert.equal(engine.gear, REVERSE);
});

test('in reverse the throttle backs the car down the road, the revs following its real reverse ratio', () => {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(straight + 200, ROAD.laneWidth / 2);
    intoReverse(vehicle);
    const start = vehicle.s;
    let event = null;
    for (let t = 0; t < 20 && vehicle.engine.rpm < vehicle.car.engine.redline && !event; t += STEP) {
        event = vehicle.step(STEP, { steer: 0, throttle: 1, brake: 0 }, track);
    }
    assert.equal(event, null);
    assert.ok(vehicle.vx < 0 && vehicle.sDot < 0 && vehicle.s < start, 'going backwards along the road');
    assert.equal(vehicle.dir, -1);
    assert.ok(vehicle.speedMph > 0, 'the speedometer reads the speed either way');
    // At the redline the car goes as fast backwards as the gear lets it.
    const geared = vehicle.drivetrain.speedAtRpm(vehicle.engine.rpm, REVERSE);
    assert.ok(Math.abs(Math.abs(vehicle.vx) - Math.abs(geared)) < 0.5, `${vehicle.vx.toFixed(1)} m/s against ${geared.toFixed(1)}`);
});

test('the brakes stop a reversing car, and a stopped car stays put, whichever gear it is in', () => {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(straight + 200, ROAD.laneWidth / 2);
    intoReverse(vehicle);
    drive(vehicle, 3, () => { return { steer: 0, throttle: 1, brake: 0 }; });
    assert.ok(vehicle.vx < -3);
    drive(vehicle, 4, () => { return stop; });
    assert.equal(vehicle.vx, 0);
    const held = vehicle.s;
    vehicle.drivetrain.shift(vehicle.engine, 1, vehicle.vx);
    vehicle.drivetrain.shift(vehicle.engine, 1, vehicle.vx);
    assert.equal(vehicle.engine.gear, 1);
    drive(vehicle, 2, () => { return { steer: 0, throttle: 0, brake: 0 }; });
    assert.ok(Math.abs(vehicle.s - held) < 0.05, 'off the throttle in first it neither creeps nor rolls back');
});

test('turning round on the real road: forward on full left lock, back on full right lock, until facing back, then away', () => {
    const facingBack = (v) => { return Math.cos(v.theta) < -0.97; };
    for (const car of CARS) {
        const vehicle = new VehicleDynamics(car);
        vehicle.reset(straight, ROAD.laneWidth / 2);
        // Each leg stops short of a side of the road: forward towards the drop, back towards the cut.
        let legs = 0;
        for (; legs < 6 && !facingBack(vehicle); legs++) {
            const forward = legs % 2 === 0;
            if (forward) {
                while (vehicle.engine.gear < 1) vehicle.drivetrain.shift(vehicle.engine, 1, vehicle.vx);
            } else {
                intoReverse(vehicle);
            }
            const event = drive(vehicle, 12, (v) => {
                const side = forward ? v.u < -ROAD.halfWidth : v.u > ROAD.halfWidth;
                return side || facingBack(v) ? stop : crawl(forward ? -1 : 1)(v);
            });
            assert.equal(event, null, `${car.id}: ${event?.cause} on leg ${legs + 1}`);
            drive(vehicle, 1.5, () => { return stop; });
        }
        assert.ok(legs <= 3, `${car.id} took ${legs} legs`);
        while (vehicle.engine.gear < 1) vehicle.drivetrain.shift(vehicle.engine, 1, vehicle.vx);
        const event = drive(vehicle, 3, (v) => {
            return { steer: clamp(-2 * wrapAngle(v.theta - Math.PI), -1, 1), throttle: 0.6, brake: 0 };
        });
        assert.equal(event, null, `${car.id}: ${event?.cause} pulling away`);
        assert.ok(Math.cos(vehicle.theta) < -0.9, `${car.id} faces ${vehicle.theta.toFixed(2)} rad`);
        assert.equal(vehicle.dir, -1, `${car.id} is going back down the road`);
        assert.ok(vehicle.sDot < -GAME.pullAwaySpeed);
    }
});

test('a car facing back down the road scrapes along the rock face facing the same way', () => {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(straight, ROAD.wallOffset - 1.2);
    vehicle.theta = Math.PI - 0.3;
    vehicle.vx = 4;
    drive(vehicle, 1, () => { return { steer: 0, throttle: 0.2, brake: 0 }; });
    assert.ok(Math.cos(vehicle.theta) < -0.95, `turned to ${vehicle.theta.toFixed(2)} rad`);
});
