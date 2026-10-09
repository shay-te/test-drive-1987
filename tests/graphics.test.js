import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHICS, POLICE } from '../src/config.js';
import { graphicsTier } from '../src/world/graphicsTier.js';
import { thinned } from '../src/world/forestLayout.js';

test('a software renderer draws a lighter world; a graphics card draws all of it', () => {
    for (const name of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa softpipe']) {
        assert.equal(graphicsTier(name), GRAPHICS.software, name);
    }
    for (const name of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)', 'Adreno (TM) 740', 'Apple GPU']) {
        assert.equal(graphicsTier(name), GRAPHICS.full, name);
    }
    // The CPU's time goes on every triangle in view: it sees the road and its slopes, not the far shore.
    assert.ok(GRAPHICS.software.far <= GRAPHICS.full.far / 10);
    assert.ok(GRAPHICS.software.far >= POLICE.lead, 'yet far enough to see a roadblock coming');
});

test('the forest thins evenly to its share', () => {
    const trees = Array.from({ length: 1000 }, (_, i) => { return { i }; });
    assert.equal(thinned(trees, 1).length, 1000);
    const few = thinned(trees, GRAPHICS.software.forest);
    assert.ok(Math.abs(few.length / 1000 - GRAPHICS.software.forest) < 0.03, `${few.length} kept`);
});
