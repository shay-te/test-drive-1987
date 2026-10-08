import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceManager } from '../src/core/ResourceManager.js';

const BASE = new URL('https://example.test/game/');

test('model loads are shared concurrently and cached after completion', async () => {
    const resources = new ResourceManager(BASE);
    let loads = 0;
    const model = { nodes: [] };
    const loader = async (url) => {
        assert.equal(url, 'https://example.test/game/cabin.glb');
        loads++;
        return model;
    };
    const first = resources.model('cabin.glb', loader);
    assert.equal(resources.model('cabin.glb', loader), first);
    assert.equal(await first, model);
    assert.equal(await resources.model('cabin.glb', loader), model);
    assert.equal(loads, 1);
    assert.equal(resources.pending.size, 0);
});

test('failed model preparation is cleared and a later retry can succeed', async () => {
    const resources = new ResourceManager(BASE);
    let attempts = 0;
    const loader = async () => {
        attempts++;
        if (attempts === 1) throw new Error('asset unavailable');
        return { loaded: true };
    };
    await assert.rejects(resources.model('cabin.glb', loader), /asset unavailable/);
    assert.equal(resources.pending.size, 0);
    assert.deepEqual(await resources.model('cabin.glb', loader), { loaded: true });
    assert.equal(attempts, 2);
});
