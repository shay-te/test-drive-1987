import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readGlb } from '../scripts/glb.mjs';
import { CABIN_VIEWS } from '../src/data/cabinViews.js';
import { carById } from '../src/data/cars.js';
import { LOOK } from '../src/config.js';
import { validateCabinNodes } from '../src/world/cabin/cabinAsset.js';
import { leverAngles, radarLights, wheelAngle } from '../src/world/cabin/cabinAnimation.js';

const asset = readGlb(new URL('../assets/models/porsche/cabin.glb', import.meta.url));

test('the complete Porsche stays inside its delivery and geometry budgets', () => {
    const primitives = asset.meshes.flatMap((mesh) => { return mesh.primitives; });
    const triangles = primitives.reduce((count, primitive) => {
        assert.equal(primitive.mode ?? 4, 4);
        return count + asset.accessors[primitive.indices].count / 3;
    }, 0);
    assert.ok(triangles <= 100_000, `${triangles} triangles exceed the model budget`);
    assert.ok(primitives.length <= 50, 'main-pass mesh draw budget');
    assert.ok(statSync(new URL('../assets/models/porsche/cabin.glb', import.meta.url)).size <= 8 * 1024 * 1024);
    assert.ok(asset.images.every((image) => { return image.bufferView !== undefined && !image.uri; }));
    const staticMeshes = asset.nodes.filter((node) => { return node.name.startsWith('static_'); });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const node of staticMeshes) {
        assert.equal(node.rotation, undefined, 'static batching bakes rotations');
        for (const primitive of asset.meshes[node.mesh].primitives) {
            const bounds = asset.accessors[primitive.attributes.POSITION];
            for (let axis = 0; axis < 3; axis++) {
                const offset = node.translation?.[axis] ?? 0;
                min[axis] = Math.min(min[axis], bounds.min[axis] + offset);
                max[axis] = Math.max(max[axis], bounds.max[axis] + offset);
            }
        }
    }
    assert.ok(max[0] - min[0] > 1.75, 'complete Turbo width, including both exterior mirrors');
    assert.ok(min[1] < 0.02 && max[1] > 1.3, 'tyres reach the road and roof is present');
    assert.ok(min[2] < -2.35 && max[2] > 1.9, 'front and rear exterior are both present');
});

test('static batching preserves separate moving control geometry and neutral pivots', () => {
    const bindings = validateCabinNodes(asset.nodes);
    for (const name of ['steering_wheel', 'gear_lever']) {
        const pivot = bindings[name];
        assert.ok(pivot.children.length > 0);
        for (const index of pivot.children) {
            assert.ok(asset.nodes[index].mesh !== undefined);
            assert.ok(!asset.nodes[index].name.startsWith('static_'));
        }
        assert.equal(pivot.rotation, undefined, 'runtime applies delta rotations to neutral local axes');
    }
    const rotation = bindings.mirror_camera.rotation;
    assert.ok(Math.abs(rotation[1]) > 1 - 1e-6, 'mirror faces backwards');
    assert.ok([0, 2, 3].every((axis) => { return Math.abs(rotation[axis]) < 1e-6; }));
});

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
