import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, carById } from '../src/data/cars.js';
import { GATES, gatePosition, stepKnob } from '../src/cockpit/shiftGate.js';
import { REVERSE } from '../src/sim/Drivetrain.js';
import { boostPsi, dialAngle, formatReading, instrumentReadings, lampStates, revState } from '../src/cockpit/instruments.js';
import { CLUSTERS } from '../src/cockpit/clusters.js';
import { formatClock, formatMiles } from '../src/util/format.js';
import { Spring } from '../src/util/math.js';

test('every car has a cluster and a shift gate covering all its gears and reverse', () => {
    for (const car of CARS) {
        assert.ok(CLUSTERS[car.cockpit.cluster], `${car.id} cluster`);
        const gate = GATES[car.cockpit.shifter.pattern];
        for (let gear = 1; gear <= car.drivetrain.gears.length; gear++) {
            assert.ok(gate.gears[gear], `${car.id} gear ${gear} has a gate position`);
        }
        const [x, y] = gatePosition(gate, REVERSE);
        assert.ok(gate.columns.includes(x) && Math.abs(y) === 1, `${car.id} reverse sits at the end of a column`);
        const taken = Object.values(gate.gears).some(([gx, gy]) => { return gx === x && gy === y; });
        assert.equal(taken, false, `${car.id} reverse has a slot of its own`);
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
    const spring = new Spring();
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

test('every instrument reads a value the cockpit provides', () => {
    for (const car of CARS) {
        const telemetry = { mph: 60, rpm: 3000, boost: 0.2, blown: false, gear: 2 };
        const readings = instrumentReadings(telemetry, car);
        for (const item of CLUSTERS[car.cockpit.cluster].instruments) {
            if (item.source === undefined) continue;
            assert.equal(typeof readings[item.source], 'number', `${car.id} ${item.source}`);
        }
    }
});

test('a second scale only shares the face of the dial drawn just before it', () => {
    for (const [name, cluster] of Object.entries(CLUSTERS)) {
        cluster.instruments.forEach((item, i) => {
            if (!item.sharesFace) return;
            const owner = cluster.instruments[i - 1];
            assert.ok(owner && !owner.sharesFace, `${name} scale ${i} has a face to share`);
            assert.deepEqual([owner.x, owner.y, owner.r], [item.x, item.y, item.r]);
        });
    }
});

test('the oil level gauge drops to zero when the engine is blown', () => {
    const porsche = carById('porsche');
    const running = instrumentReadings({ mph: 0, rpm: 950, boost: 0, blown: false }, porsche);
    const blown = instrumentReadings({ mph: 0, rpm: 0, boost: 0, blown: true }, porsche);
    assert.ok(running.oilLevel > 0.5);
    assert.equal(blown.oilLevel, 0);
});

test('the outside readout warns as the revs near the redline, and past it the engine is wearing out', () => {
    const porsche = carById('porsche');
    const { redline } = porsche.engine;
    assert.equal(revState({ rpm: redline - 1000, overRev: 0 }, porsche), 'normal');
    assert.equal(revState({ rpm: redline - 100, overRev: 0 }, porsche), 'high');
    assert.equal(revState({ rpm: redline + 200, overRev: 0 }, porsche), 'over');
    assert.equal(revState({ rpm: redline - 2000, overRev: 0.4 }, porsche), 'over', 'still recovering from over-revving');
});

test('boost reads in psi up to each turbo car\'s real peak; atmospheric cars have none', () => {
    assert.equal(boostPsi({ boost: 1 }, carById('porsche')), 11.6);
    assert.equal(boostPsi({ boost: 0.5 }, carById('lotus')), 4);
    assert.equal(boostPsi({ boost: 1 }, carById('ferrari')), null);
});
