import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readGlb } from '../scripts/glb.mjs';
import { ROAD } from '../src/config.js';
import { SCENERY_MODELS } from '../src/data/scenery.js';
import { STAGES } from '../src/data/stages.js';
import { TRAFFIC_TYPES } from '../src/data/traffic.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';

/** A baked model's bounds over all its primitives: [min, max] per axis. */
function bounds(model) {
    const primitives = model.meshes.flatMap((mesh) => { return mesh.primitives; });
    const extreme = (pick, side) => {
        return [0, 1, 2].map((axis) => {
            return pick(...primitives.map((p) => { return model.accessors[p.attributes.POSITION][side][axis]; }));
        });
    };
    return { min: extreme(Math.min, 'min'), max: extreme(Math.max, 'max') };
}

/** Triangle and draw-call budget, file size, and transforms baked into the geometry. */
function assertDelivery(model, url, { triangles: maxTriangles, primitives: maxPrimitives, bytes }) {
    const primitives = model.meshes.flatMap((mesh) => { return mesh.primitives; });
    const triangles = primitives.reduce((n, primitive) => { return n + model.accessors[primitive.indices].count / 3; }, 0);
    assert.ok(triangles <= maxTriangles, `${triangles} triangles`);
    assert.ok(primitives.length <= maxPrimitives, `${primitives.length} draw calls`);
    assert.ok(statSync(url).size <= bytes);
    assert.ok(model.nodes.every((node) => { return !node.translation && !node.rotation && !node.scale; }), 'transforms are baked');
}

const MODELLED = Object.entries(TRAFFIC_TYPES).filter(([, spec]) => { return spec.model; });

test('the patrol car is the authored Crown Victoria; other traffic stays procedural', () => {
    assert.deepEqual(MODELLED.map(([id, spec]) => { return [id, spec.model]; }), [['police', 'assets/models/police/model.glb']]);
});

for (const [id, spec] of MODELLED) {
    const url = new URL(`../${spec.model}`, import.meta.url);
    const model = readGlb(url);

    test(`the ${id} model matches its traffic size, centred on the road, within budget`, () => {
        assertDelivery(model, url, { triangles: 25_000, primitives: 20, bytes: 4 * 1024 * 1024 });
        const { min, max } = bounds(model);
        assert.ok(Math.abs(max[2] - min[2] - spec.length) < 0.01, 'bumper to bumper is the traffic length');
        assert.ok(Math.abs(max[2] + min[2]) < 0.01, 'centred along the car, like the procedural traffic');
        assert.ok(Math.abs(max[0] + min[0]) < 0.01, 'centred across');
        assert.ok(max[0] - min[0] >= spec.width - 0.05 && max[0] - min[0] <= spec.width + 0.25, 'body width, plus mirrors');
        assert.ok(min[1] < 0.02, 'tyres on the road');
        assert.ok(max[1] >= spec.height && max[1] <= spec.height + 0.3, 'roof height, plus a light bar');
    });

    if (spec.lightBar) {
        test(`the ${id} light bar has one red and one blue lens mesh that can glow`, () => {
            const materials = Object.values(spec.lightBar).map((name) => {
                const nodes = model.nodes.filter((node) => { return node.name === name; });
                assert.equal(nodes.length, 1, `one "${name}" node`);
                const primitives = model.meshes[nodes[0].mesh].primitives;
                assert.equal(primitives.length, 1);
                const material = model.materials[primitives[0].material];
                assert.ok(material.emissiveTexture, `"${name}" glows with its lens texture`);
                return primitives[0].material;
            });
            assert.notEqual(materials[0], materials[1], 'red and blue flash independently');
        });
    }
}

test('the gas station is the authored model, delivered small', () => {
    const { model: path } = SCENERY_MODELS.station;
    const url = new URL(`../${path}`, import.meta.url);
    assertDelivery(readGlb(url), url, { triangles: 25_000, primitives: 10, bytes: 2 * 1024 * 1024 });
});

test('on every stage the station stands inside its pull-out, clear of the road, with the bay on the forecourt', () => {
    const { model: path, bay } = SCENERY_MODELS.station;
    const { min, max } = bounds(readGlb(new URL(`../${path}`, import.meta.url)));
    assert.ok(min[1] > -0.2 && min[1] <= 0, 'standing on the ground');
    assert.ok(bay[0] > min[0] && bay[0] < 0 && Math.abs(bay[1]) < max[2], 'the bay is on the road side, under the canopy');
    for (const stage of STAGES.filter((candidate) => { return !candidate.summit; })) {
        const track = buildTrack(stage);
        const station = track.props.find((prop) => { return prop.type === 'station'; });
        for (let z = min[2]; z <= max[2]; z += track.segment) {
            // The station's local -z runs up the road, so its local z sits at s - z.
            assert.ok(station.u + max[0] < track.wallOffsetAt(station.s - z) - 1, `${stage.name}: the store's back clears the rock face`);
        }
        assert.ok(station.u + min[0] > ROAD.halfWidth + 2, `${stage.name}: the forecourt keeps off the road`);
    }
});
