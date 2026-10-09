import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The stage's shared materials are built by WorldMaterials (it needs WebGL, so it is read, not run). */
const MATERIALS = 'src/world/Materials.js';
/** Scenery builders and how each names the stage's materials (WorldBuilder keeps them as `m`). */
const BUILDERS = {
    'src/world/WorldBuilder.js': /\b(?:materials|m)\.([a-z][A-Za-z]*)\b/g,
    'src/world/Props.js': /\bmaterials\.([a-z][A-Za-z]*)\b/g,
    'src/world/guardRail.js': /\bmaterials\.([a-z][A-Za-z]*)\b/g,
    'src/world/Forest.js': /\bmaterials\.([a-z][A-Za-z]*)\b/g,
    'src/world/Terrain.js': /\bmaterials\.([a-z][A-Za-z]*)\b/g,
};

test('every material the scenery asks for is one the stage builds (else three.js draws it plain white)', () => {
    const source = readFileSync(MATERIALS, 'utf8');
    const built = new Set([...source.matchAll(/this\.([a-z][A-Za-z]*) = /g)].map(([, name]) => { return name; }));
    const methods = new Set([...source.matchAll(/^ {4}([a-z][A-Za-z]*)\(/gm)].map(([, name]) => { return name; }));
    for (const [file, use] of Object.entries(BUILDERS)) {
        for (const [, name] of readFileSync(file, 'utf8').matchAll(use)) {
            assert.ok(built.has(name) || methods.has(name), `${file} uses materials.${name}, which WorldMaterials never builds`);
        }
    }
});
