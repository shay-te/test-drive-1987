import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readGlb } from '../scripts/glb.mjs';
import { CABIN_VIEWS } from '../src/data/cabinViews.js';
import { CARS } from '../src/data/cars.js';
import { LOOK } from '../src/config.js';
import { validateCabinNodes } from '../src/world/cabin/cabinAsset.js';
import { leverAngles, radarLights, wheelAngle } from '../src/world/cabin/cabinAnimation.js';

const AUTHORED = CARS.filter((car) => { return car.cockpit.model; });
const modelUrl = (car) => { return new URL(`../${car.cockpit.model}`, import.meta.url); };
const assets = new Map(AUTHORED.map((car) => { return [car.id, readGlb(modelUrl(car))]; }));
const asset = assets.get('porsche');

test('the Porsche and the Ferrari drive authored cabins; the rest stay procedural', () => {
    assert.deepEqual(
        AUTHORED.map((car) => { return [car.id, car.cockpit.model]; }),
        [['porsche', 'assets/models/porsche/cabin.glb'], ['ferrari', 'assets/models/ferrari/cabin.glb']],
    );
});

for (const car of AUTHORED) {
    const model = assets.get(car.id);

    test(`the complete ${car.fullName} stays inside its delivery and geometry budgets`, () => {
        const primitives = model.meshes.flatMap((mesh) => { return mesh.primitives; });
        const triangles = primitives.reduce((count, primitive) => {
            assert.equal(primitive.mode ?? 4, 4);
            return count + model.accessors[primitive.indices].count / 3;
        }, 0);
        assert.ok(triangles <= 100_000, `${triangles} triangles exceed the model budget`);
        assert.ok(primitives.length <= 50, 'main-pass mesh draw budget');
        assert.ok(statSync(modelUrl(car)).size <= 8 * 1024 * 1024);
        assert.ok((model.images ?? []).every((image) => { return image.bufferView !== undefined && !image.uri; }));
        const staticMeshes = model.nodes.filter((node) => { return node.name.startsWith('static_'); });
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const node of staticMeshes) {
            assert.equal(node.rotation, undefined, 'static batching bakes rotations');
            for (const primitive of model.meshes[node.mesh].primitives) {
                const bounds = model.accessors[primitive.attributes.POSITION];
                for (let axis = 0; axis < 3; axis++) {
                    const offset = node.translation?.[axis] ?? 0;
                    min[axis] = Math.min(min[axis], bounds.min[axis] + offset);
                    max[axis] = Math.max(max[axis], bounds.max[axis] + offset);
                }
            }
        }
        const { width, height, length, eye } = car.body;
        assert.ok(max[0] - min[0] >= width, 'complete width, including both exterior mirrors');
        assert.ok(min[1] < 0.02 && max[1] > height - 0.01, 'tyres reach the road and roof is present');
        assert.ok(Math.abs(min[2] + eye) < 0.006, 'front bumper matches the body data, relative to the seated eye');
        const overhang = max[2] - (length - eye);
        assert.ok(overhang >= 0 && overhang < 0.05, 'rear bumper and exhaust stay within the body overhang');
    });

    test(`${car.fullName} batching keeps moving controls separate, pivots neutral and surfaces mapped`, () => {
        const bindings = validateCabinNodes(model.nodes);
        for (const name of ['steering_wheel', 'gear_lever']) {
            const pivot = bindings[name];
            assert.ok(pivot.children.length > 0);
            for (const index of pivot.children) {
                assert.ok(model.nodes[index].mesh !== undefined);
                assert.ok(!model.nodes[index].name.startsWith('static_'));
            }
            assert.equal(pivot.rotation, undefined, 'runtime applies delta rotations to neutral local axes');
        }
        const rotation = bindings.mirror_camera.rotation;
        assert.ok(Math.abs(rotation[1]) > 1 - 1e-6, 'mirror faces backwards');
        assert.ok([0, 2, 3].every((axis) => { return Math.abs(rotation[axis]) < 1e-6; }));
        assert.equal(bindings.driver_eye.translation[2], 0, 'body bounds are measured from the seated eye');
        for (const name of ['instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface']) {
            const primitives = model.meshes[bindings[name].mesh].primitives;
            assert.equal(primitives.length, 1);
            assert.ok(primitives.every((primitive) => { return primitive.attributes.TEXCOORD_0 !== undefined; }));
        }
    });
}

test('Porsche enamel exports dielectric paint with a separate clearcoat highlight', () => {
    const paint = asset.materials.find((material) => { return material.name === '930 • seafoam enamel'; });
    assert.equal(paint.pbrMetallicRoughness.metallicFactor, 0);
    assert.ok(paint.extensions.KHR_materials_clearcoat.clearcoatFactor >= 0.8);
    assert.ok(paint.extensions.KHR_materials_clearcoat.clearcoatRoughnessFactor < 0.1);
});

test('the Porsche seats the driver at the procedural cabin eye', () => {
    const nodes = validateCabinNodes(asset.nodes);
    assert.ok(Math.abs(nodes.driver_eye.translation[0] + 0.36) < 1e-6);
    assert.ok(Math.abs(nodes.driver_eye.translation[1] - 1.08) < 1e-6);
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
