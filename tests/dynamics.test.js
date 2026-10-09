import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, carById } from '../src/data/cars.js';
import { STAGES } from '../src/data/stages.js';
import { PHYS } from '../src/config.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { VehicleDynamics } from '../src/sim/VehicleDynamics.js';
import { driveGrip } from '../src/sim/axleLoads.js';
import { runStage } from './helpers/autopilot.js';

const tracks = STAGES.map(buildTrack);

for (const car of CARS) {
    test(`${car.id}: a careful driver completes every stage`, () => {
        for (const [index, track] of tracks.entries()) {
            const vehicle = new VehicleDynamics(car);
            vehicle.reset(track.startS, 1.8);
            const result = runStage(vehicle, track);
            assert.ok(
                result.finished,
                `stage ${index + 1}: ${result.event?.cause} at s=${result.s.toFixed(0)}`,
            );
            const avgMph = (track.finishS - track.startS) / result.time / PHYS.mph;
            assert.ok(avgMph > 70, `stage ${index + 1} average ${avgMph.toFixed(0)} mph`);
        }
    });
}

test('full lock at the limit runs wide instead of spinning', () => {
    const road = buildTrack(STAGES[0]);
    for (const car of CARS) {
        const vehicle = new VehicleDynamics(car);
        vehicle.reset(road.startS, 0);
        vehicle.vx = 45;
        let maxSlip = 0;
        for (let i = 0; i < 240; i++) {
            vehicle.step(1 / 120, { steer: 1, throttle: 0, brake: 0 }, road);
            vehicle.u = 0;
            vehicle.theta = 0;
            maxSlip = Math.max(maxSlip, Math.abs(Math.atan2(vehicle.vy, vehicle.vx)));
        }
        assert.ok(maxSlip < 0.2, `${car.id} body slip reached ${maxSlip.toFixed(2)} rad`);
    }
});

test('flat out into a hairpin ends in a crash', () => {
    const track = tracks[4];
    let hairpin = track.startS;
    for (let s = track.startS; s < track.finishS; s += 4) {
        if (Math.abs(track.curvatureAt(s)) > 1 / 130) {
            hairpin = s;
            break;
        }
    }
    const vehicle = new VehicleDynamics(carById('lamborghini'));
    vehicle.reset(hairpin - 150, 1.8);
    vehicle.vx = 130 * PHYS.mph;
    vehicle.engine.gear = 4;
    let event = null;
    for (let i = 0; i < 1200 && !event; i++) {
        event = vehicle.step(
            1 / 60,
            { steer: Math.sign(track.curvatureAt(vehicle.s)), throttle: 1, brake: 0 },
            track,
        );
    }
    assert.ok(event && event.type === 'crash');
});

test('the car on the road pulls away with the force its road test was fitted with: the engine\'s, up to the tyres\' grip', () => {
    const road = tracks[0];
    for (const car of CARS) {
        const vehicle = new VehicleDynamics(car);
        vehicle.reset(road.startS + 400, 1.8);
        const { drivetrain, engine } = vehicle;
        drivetrain.shift(engine, 1, 0);
        Object.assign(engine, { rpm: drivetrain.launchRpm, boost: drivetrain.boostCeiling(drivetrain.launchRpm), shiftTimer: 0 });
        vehicle.throttle = 1;
        vehicle.vx = 3;
        let pushed = 0;
        for (let i = 0; i < 60; i++) {
            const v = vehicle.vx;
            vehicle.step(1 / 120, { steer: 0, throttle: 1, brake: 0 }, road);
            const resist = drivetrain.resistance(vehicle.vx) + car.chassis.massKg * PHYS.g * road.gradeAt(vehicle.s);
            pushed = (vehicle.vx - v) * 120 * drivetrain.effectiveMass(engine.gear) + resist;
        }
        const fitted = Math.min(drivetrain.update({ ...engine }, vehicle.vx, 1, 0), driveGrip(car.chassis, vehicle.longAccel));
        assert.ok(Math.abs(pushed / fitted - 1) < 0.03, `${car.id}: ${pushed.toFixed(0)} N on the road, ${fitted.toFixed(0)} N in its road test`);
    }
});
