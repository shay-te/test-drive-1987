import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, carById } from '../src/data/cars.js';
import { GATES, gatePosition, stepKnob } from '../src/cockpit/GearLever.js';
import { dialAngle, formatReading, lampStates, NeedleSpring } from '../src/cockpit/instruments.js';
import { CLUSTERS } from '../src/cockpit/clusters.js';
import { formatClock, formatMiles } from '../src/util/format.js';

test('every car has a cluster and a shift gate covering all its gears', () => {
    for (const car of CARS) {
        assert.ok(CLUSTERS[car.cockpit.cluster], `${car.id} cluster`);
        const gate = GATES[car.cockpit.shifter.pattern];
        for (let gear = 1; gear <= car.drivetrain.gears.length; gear++) {
            assert.ok(gate.gears[gear], `${car.id} gear ${gear} has a gate position`);
        }
    }
});

test('the knob travels through neutral when changing column', () => {
    const gate = GATES.dogleg5;
    let knob = gatePosition(gate, 2);
    const path = [knob];
    for (let i = 0; i < 200; i++) {
        knob = stepKnob(knob, gatePosition(gate, 4), 0.05);
        path.push(knob);
    }
    assert.deepEqual(knob, gatePosition(gate, 4));
    for (const [x, y] of path) {
        const onColumn = gate.columns.some((c) => {
            return Math.abs(x - c) < 1e-6;
        });
        assert.ok(onColumn || Math.abs(y) < 1e-6, `knob left the gate at ${x},${y}`);
    }
});

test('dial angles span the sweep and clamp outside the range', () => {
    const dial = { min: 0, max: 8, startDeg: 135, endDeg: 405 };
    assert.equal(dialAngle(dial, 0), 135);
    assert.equal(dialAngle(dial, 8), 405);
    assert.equal(dialAngle(dial, 12), 405);
    assert.equal(dialAngle(dial, 4), 270);
});

test('needles settle on their reading', () => {
    const spring = new NeedleSpring();
    for (let i = 0; i < 300; i++) spring.update(120, 1 / 60);
    assert.ok(Math.abs(spring.value - 120) < 0.5);
});

test('LCD readouts are formatted like the C4 cluster', () => {
    assert.equal(formatReading('rpm', 5.21), '5200');
    assert.equal(formatReading('volts', 13.84), '13.8');
    assert.equal(formatReading(undefined, 103.6), '104');
});

test('the overdrive lamp lights in the Corvette top gear only', () => {
    const corvette = carById('corvette');
    const telemetry = (gear) => {
        return { gear, rpm: 3000, blown: false };
    };
    assert.equal(lampStates(telemetry(5), corvette, 0).overdrive, true);
    assert.equal(lampStates(telemetry(4), corvette, 0).overdrive, false);
    assert.equal(lampStates(telemetry(5), carById('ferrari'), 0).overdrive, false);
});

test('clock and distance formatting', () => {
    assert.equal(formatClock(83.45), '1:23.5');
    assert.equal(formatClock(5), '0:05.0');
    assert.equal(formatMiles(1609.34), '1.0');
});
