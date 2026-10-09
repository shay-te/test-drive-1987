import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SMOKE } from '../src/config.js';
import { EngineSmoke } from '../src/sim/EngineSmoke.js';

const bay = { x: 0, y: 1, z: 0 };

test('a blown engine pours smoke that rises, drifts with the wind, swells and thins out', () => {
    const smoke = new EngineSmoke(5);
    for (let t = 0; t < 2; t += 1 / 60) smoke.update(1 / 60, bay, true);
    assert.ok(smoke.puffs.length > SMOKE.rate, `${smoke.puffs.length} puffs`);
    const oldest = smoke.puffs[0];
    assert.ok(oldest.y > bay.y + 1, 'rises');
    assert.ok(oldest.x > bay.x, 'drifts downwind');
    assert.ok(oldest.size > SMOKE.size[1], 'swells');
    assert.ok(oldest.fade < 1 && oldest.fade > 0, 'thins out');
});

test('it stops when the fire is out, never exceeds its most, and clears', () => {
    const smoke = new EngineSmoke(5);
    for (let t = 0; t < 30; t += 1 / 60) smoke.update(1 / 60, bay, true);
    assert.ok(smoke.puffs.length <= SMOKE.most);
    for (let t = 0; t < SMOKE.life[1] + 0.1; t += 1 / 60) smoke.update(1 / 60, bay, false);
    assert.equal(smoke.puffs.length, 0, 'gone once the last puffs have thinned away');
    smoke.update(1, bay, true);
    smoke.clear();
    assert.equal(smoke.puffs.length, 0);
});
