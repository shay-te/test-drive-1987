import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Noise } from '../src/util/math.js';

test('cellular noise splits space into blocks: one value per block, joints where two blocks meet', () => {
    const noise = new Noise(7);
    const values = new Set();
    let joints = 0;
    for (let i = 0; i < 4000; i++) {
        const [x, y, z] = [i * 0.037, Math.sin(i) * 3, i * 0.011];
        const { near, next, id } = noise.cells3(x, y, z);
        assert.ok(near <= next && near < Math.sqrt(3), 'the nearest point is the nearer');
        assert.ok(id >= 0 && id <= 1);
        assert.deepEqual(noise.cells3(x, y, z), { near, next, id }, 'the same everywhere it is asked');
        values.add(id);
        if (next - near < 0.05) joints++;
    }
    assert.ok(values.size > 30, 'many blocks, each with its own value');
    assert.ok(joints > 20 && joints < 800, `a thin web of joints (${joints} of 4000 samples)`);
    // Within one block the value holds; across a joint it changes.
    const a = noise.cells3(0.5, 0.5, 0.5);
    assert.equal(noise.cells3(0.5 + 1e-4, 0.5, 0.5).id, a.id);
});
