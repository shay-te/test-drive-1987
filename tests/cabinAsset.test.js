import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGlb } from '../scripts/glb.mjs';
import { CABIN_VIEWS } from '../src/data/cabinViews.js';
import { carById } from '../src/data/cars.js';
import { LOOK } from '../src/config.js';
import { validateCabinNodes } from '../src/world/cabin/cabinAsset.js';
import { leverAngles, radarLights, wheelAngle } from '../src/world/cabin/cabinAnimation.js';

const asset = readGlb(new URL('../assets/models/porsche/cabin.glb', import.meta.url));

test('the configured Porsche asset has its required mesh bindings and seated eye', () => {
    assert.equal(carById('porsche').cockpit.model, 'assets/models/porsche/cabin.glb');
    const nodes = validateCabinNodes(asset.nodes);
    assert.ok(Math.abs(nodes.driver_eye.translation[0] + 0.36) < 1e-6);
    assert.ok(Math.abs(nodes.driver_eye.translation[1] - 1.08) < 1e-6);
    assert.equal(nodes.driver_eye.translation[2], 0);
    for (const name of ['instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface']) {
        const primitives = asset.meshes[nodes[name].mesh].primitives;
        assert.equal(primitives.length, 1);
        assert.ok(primitives.every((primitive) => { return primitive.attributes.TEXCOORD_0 !== undefined; }));
    }
});

test('missing or duplicated cabin bindings fail instead of selecting an arbitrary node', () => {
    const missing = asset.nodes.filter((node) => { return node.name !== 'gear_lever'; });
    assert.throws(() => { validateCabinNodes(missing); }, /gear_lever/);
    assert.throws(() => { validateCabinNodes([...asset.nodes, asset.nodes.find((node) => { return node.name === 'driver_eye'; })]); }, /driver_eye/);
    const invalid = asset.nodes.map((node) => { return { ...node }; });
    delete invalid.find((node) => { return node.name === 'instrument_surface'; }).mesh;
    assert.throws(() => { validateCabinNodes(invalid); }, /must be a mesh/);
});

test('inspection presets stay reachable by the seated camera', () => {
    for (const view of CABIN_VIEWS) {
        assert.ok(Math.abs(view.yaw) <= LOOK.yawLimit);
        assert.ok(view.pitch >= -LOOK.pitchDown && view.pitch <= LOOK.pitchUp);
    }
    assert.ok(CABIN_VIEWS.find((view) => { return view.id === 'rear'; }).yaw > Math.PI / 2);
});

test('shared wheel, lever, and radar animation handles neutral, limits, and blinking', () => {
    assert.ok(wheelAngle(0) === 0);
    assert.equal(wheelAngle(2), wheelAngle(1));
    assert.deepEqual(leverAngles([0, 0]), { x: 0, z: -0 });
    assert.ok(leverAngles([1, 1]).x > 0 && leverAngles([1, 1]).z < 0);
    assert.deepEqual(radarLights(0, 0, 6), Array(6).fill(false));
    assert.deepEqual(radarLights(1, 0, 6), Array(6).fill(true));
    assert.deepEqual(radarLights(1, 0.2, 6), Array(6).fill(false));
});
