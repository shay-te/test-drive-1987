import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readFloats, readGlb } from '../scripts/glb.mjs';
import { CABIN_VIEWS } from '../src/data/cabinViews.js';
import { CARS } from '../src/data/cars.js';
import { LOOK } from '../src/config.js';
import { SURFACES, sideMirrorNodes, validateCabinNodes } from '../src/world/cabin/cabinAsset.js';
import { rotate } from '../src/util/quaternion.js';
import { leverAngles, radarLights, wheelAngle } from '../src/world/cabin/cabinAnimation.js';
import { GATES, gatePosition } from '../src/cockpit/shiftGate.js';
import { REVERSE } from '../src/sim/Drivetrain.js';
import { profileFrame } from '../src/world/profileFrame.js';

const AUTHORED = CARS.filter((car) => { return car.cockpit.model; });
const modelUrl = (car) => { return new URL(`../${car.cockpit.model}`, import.meta.url); };
const assets = new Map(AUTHORED.map((car) => { return [car.id, readGlb(modelUrl(car))]; }));
const asset = assets.get('porsche');

/** Car-space bounds of the batched static body and cabin, whose rotations batching must bake. */
function staticBounds(model) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const node of model.nodes.filter((node) => { return node.name.startsWith('static_'); })) {
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
    return { min, max };
}

test('every car drives an authored cabin', () => {
    assert.deepEqual(
        AUTHORED.map((car) => { return [car.id, car.cockpit.model]; }),
        [
            ['porsche', 'assets/models/porsche/cabin.glb'],
            ['ferrari', 'assets/models/ferrari/cabin.glb'],
            ['lamborghini', 'assets/models/lamborghini/cabin.glb'],
            ['lotus', 'assets/models/lotus/cabin.glb'],
            ['corvette', 'assets/models/corvette/cabin.glb'],
        ],
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
        const { min, max } = staticBounds(model);
        const { width, height, length, eye } = car.body;
        assert.ok(max[0] - min[0] >= width, 'complete width, including both exterior mirrors');
        assert.ok(min[1] < 0.02 && max[1] > height - 0.05, 'tyres reach the road and the roof is at the car\'s height');
        assert.ok(Math.abs(min[2] + eye) < 0.006, 'front bumper matches the body data, relative to the seated eye');
        assert.ok(Math.abs(max[2] - (length - eye)) < 0.005, 'rear bumper matches the body length');
    });

    test(`the ${car.fullName} seats the driver behind the wheel, under the roof`, () => {
        const bindings = validateCabinNodes(model.nodes);
        const [x, y] = bindings.driver_eye.translation;
        const wheel = model.nodes.indexOf(bindings.steering_wheel);
        const [hubX, hubY, hubZ] = model.nodes.find((node) => { return node.children?.includes(wheel); }).translation;
        assert.ok(Math.abs(hubX - x) < 0.05, 'the wheel is centred on the driver');
        assert.ok(hubZ < -0.35 && hubZ > -0.8, `the hub is ${(-hubZ).toFixed(2)} m ahead of the eye`);
        assert.ok(y - hubY > 0.15, 'the eye looks over the hub');
        assert.ok(staticBounds(model).max[1] - y > 0.1, 'headroom under the roof');
    });

    test(`the ${car.fullName} title photo frames it nose-left on the road, sharp on a 2x display`, () => {
        const { min, max } = staticBounds(model);
        const point = ([x, y, z]) => { return { x, y, z }; };
        const frame = profileFrame(point(min), point(max));
        assert.equal(frame.left, min[2], 'the nose (-z) sits on the left edge');
        assert.equal(frame.right, max[2]);
        assert.equal(frame.bottom, 0, 'the road is the bottom edge');
        assert.ok(frame.top > max[1], 'the roof stays clear of the top edge');
        const across = (frame.right - frame.left) / frame.width;
        const up = (frame.top - frame.bottom) / frame.height;
        assert.ok(Math.abs(across / up - 1) < 0.01, 'square pixels keep the car in proportion');
        assert.ok(frame.width >= 2 * 560, 'covers the title car width (560) at the 2x display cap');
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
        for (const name of SURFACES) {
            const primitives = model.meshes[bindings[name].mesh].primitives;
            assert.equal(primitives.length, 1);
            const uv = readFloats(modelUrl(car), model, primitives[0].attributes.TEXCOORD_0);
            assert.ok(uv.every(Number.isFinite), `${name} UVs are numbers`);
            assert.ok(Math.min(...uv) === 0 && Math.max(...uv) === 1, `${name} UVs cover the whole image`);
        }
    });
}

test('the Porsche body is opaque while its atlas windows stay see-through', () => {
    const material = (name) => { return asset.materials.find((m) => { return m.name === name; }); };
    assert.equal(material('Main_Body__0').alphaMode ?? 'OPAQUE', 'OPAQUE');
    const windows = material('Main_Body__0 • translucent');
    assert.equal(windows.alphaMode, 'BLEND');
    const texture = asset.textures[windows.pbrMetallicRoughness.baseColorTexture.index];
    assert.equal(asset.images[texture.source].mimeType, 'image/png', 'a JPEG would drop the window alpha');
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

/** Where the knob goes for each gear in the real cars: the 930's four-speed H, the dog-leg first of the
 *  Testarossa and Countach, the Esprit's H with fifth up on the right, and the Corvette's 4+3
 *  (overdrive fourth is fourth's slot); and reverse. */
const REAL_GATES = {
    porsche4: { 1: 'left forward', 2: 'left back', 3: 'right forward', 4: 'right back', [REVERSE]: 'left forward' },
    dogleg5: { 1: 'left back', 2: 'centre forward', 3: 'centre back', 4: 'right forward', 5: 'right back', [REVERSE]: 'left forward' },
    h5: { 1: 'left forward', 2: 'left back', 3: 'centre forward', 4: 'centre back', 5: 'right forward', [REVERSE]: 'right back' },
    overdrive: { 1: 'left forward', 2: 'left back', 3: 'right forward', 4: 'right back', 5: 'right back', [REVERSE]: 'left forward' },
};

test('each cabin\'s lever leans its knob to where the real car keeps each gear', () => {
    const word = (value, [less, more]) => {
        return Math.abs(value) < 1e-9 ? 'centre' : value < 0 ? less : more;
    };
    for (const car of AUTHORED) {
        const model = assets.get(car.id);
        const lever = model.nodes.find((node) => { return node.name === 'gear_lever'; });
        assert.equal(lever.rotation, undefined, `${car.id}: the lever stands in the car's own frame`);
        const pattern = car.cockpit.shifter.pattern;
        for (const [gear, place] of Object.entries(REAL_GATES[pattern])) {
            const { x, z } = leverAngles(gatePosition(GATES[pattern], Number(gear)));
            // Three's XYZ Euler turns the lever's up axis by z, then x.
            const knob = [-Math.sin(z), Math.cos(z) * Math.sin(x)];
            assert.equal(`${word(knob[0], ['left', 'right'])} ${word(knob[1], ['forward', 'back'])}`, place, `${car.id} gear ${gear}`);
        }
    }
});

test('door mirrors: the Porsche has the driver\'s, every other car both, each looking back and out', () => {
    const sides = Object.fromEntries(AUTHORED.map((car) => {
        return [car.id, Object.keys(sideMirrorNodes(assets.get(car.id).nodes))];
    }));
    assert.deepEqual(sides, { porsche: ['left'], ferrari: ['left', 'right'], lamborghini: ['left', 'right'], lotus: ['left', 'right'], corvette: ['left', 'right'] });
    for (const car of AUTHORED) {
        const model = assets.get(car.id);
        for (const [side, { surface, camera }] of Object.entries(sideMirrorNodes(model.nodes))) {
            const [x, y, z, w] = camera.rotation;
            const look = rotate({ x, y, z, w }, { x: 0, y: 0, z: -1 });
            assert.ok(look.z > 0.85, `${car.id} ${side}: looks back down the road`);
            assert.ok(Math.sign(look.x) === (side === 'left' ? -1 : 1), `${car.id} ${side}: looks out along its own side`);
            assert.ok(Math.sign(camera.translation[0]) === (side === 'left' ? -1 : 1), `${car.id} ${side}: on its own door`);
            const uv = readFloats(modelUrl(car), model, model.meshes[surface.mesh].primitives[0].attributes.TEXCOORD_0);
            assert.ok(Math.min(...uv) === 0 && Math.max(...uv) === 1, `${car.id} ${side}: the picture covers the glass`);
        }
    }
});

test('a door mirror surface without its camera is refused', () => {
    const nodes = assets.get('ferrari').nodes.filter((node) => { return node.name !== 'mirror_right_camera'; });
    assert.throws(() => { sideMirrorNodes(nodes); }, /right door mirror/);
});

test('every car carries its licence plate on its tail, facing back, the size of a real plate', () => {
    for (const car of AUTHORED) {
        const { plates, length, eye } = car.body;
        const rear = plates.filter(({ facing }) => { return facing[2] > 0.9; });
        assert.equal(rear.length, 1, `${car.id}: one plate at the back`);
        assert.ok(Math.abs(rear[0].at[2] - (length - eye)) < 0.35, `${car.id}: on the tail, not inside the car`);
        for (const { at, size } of plates) {
            assert.ok(Math.abs(at[0]) < 0.05, `${car.id}: plates sit in the middle`);
            assert.ok(at[1] > 0.2 && at[1] < 0.8, `${car.id}: at bumper height`);
            // From a North American 12 x 6 in plate to a European 520 x 110 mm one.
            assert.ok(size[0] >= 0.26 && size[0] <= 0.53 && size[1] >= 0.09 && size[1] <= 0.16, `${car.id}: ${size}`);
        }
    }
});
