import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRASH } from '../src/config.js';
import { ImpactGate } from '../src/audio/impactGate.js';

const { audible, cooldown, harder, loud } = CRASH.sound;

test('a tumbling car is heard at each fresh knock, not at every step it touches the ground', () => {
    const gate = new ImpactGate();
    assert.equal(gate.hear(0, audible / 2), 0, 'a touch is not heard');
    assert.equal(gate.hear(0.1, loud / 2), 0.5, 'a knock is, by how hard it was');
    let heard = 0;
    // The same contact pressing on step after step (120 a second) for half a second.
    for (let t = 0.1 + 1 / 120; t < 0.6; t += 1 / 120) if (gate.hear(t, loud / 2)) heard++;
    assert.equal(heard, 1, 'once more only after the cooldown');
    assert.ok(gate.hear(0.6 + cooldown / 2, loud * harder) > 0, 'a much harder hit is heard at once');
    assert.equal(gate.hear(5, loud * 2), 1, 'never louder than full');
});

test('every crash sound is a recording that ships with the game', () => {
    const manifest = JSON.parse(readFileSync('assets/audio/effects/manifest.json'));
    assert.deepEqual(Object.keys(manifest).sort(), ['crack', 'crash', 'impact']);
    for (const files of Object.values(manifest)) {
        for (const file of files) {
            const bytes = readFileSync(file);
            assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file);
            assert.ok(bytes.length > 20000 && bytes.length < 400000, `${file}: ${bytes.length} bytes`);
        }
    }
});
