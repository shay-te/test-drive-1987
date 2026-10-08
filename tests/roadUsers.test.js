import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { readGlb } from '../scripts/glb.mjs';
import { TRAFFIC_TYPES } from '../src/data/traffic.js';

const MODELLED = Object.entries(TRAFFIC_TYPES).filter(([, spec]) => { return spec.model; });

test('the patrol car is the authored Crown Victoria; other traffic stays procedural', () => {
    assert.deepEqual(MODELLED.map(([id, spec]) => { return [id, spec.model]; }), [['police', 'assets/models/police/model.glb']]);
});

for (const [id, spec] of MODELLED) {
    const url = new URL(`../${spec.model}`, import.meta.url);
    const model = readGlb(url);

    test(`the ${id} model matches its traffic size, centred on the road, within budget`, () => {
        const primitives = model.meshes.flatMap((mesh) => { return mesh.primitives; });
        const triangles = primitives.reduce((n, primitive) => { return n + model.accessors[primitive.indices].count / 3; }, 0);
        assert.ok(triangles <= 25_000, `${triangles} triangles`);
        assert.ok(primitives.length <= 20, `${primitives.length} draw calls per car`);
        assert.ok(statSync(url).size <= 4 * 1024 * 1024);
        assert.ok(model.nodes.every((node) => { return !node.translation && !node.rotation && !node.scale; }), 'transforms are baked');
        const min = [0, 1, 2].map((axis) => {
            return Math.min(...primitives.map((p) => { return model.accessors[p.attributes.POSITION].min[axis]; }));
        });
        const max = [0, 1, 2].map((axis) => {
            return Math.max(...primitives.map((p) => { return model.accessors[p.attributes.POSITION].max[axis]; }));
        });
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
