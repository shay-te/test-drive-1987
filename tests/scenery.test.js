import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENERY_TEXTURES } from '../src/data/scenery.js';

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(bytes) {
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'a JPEG');
    for (let at = 2; at < bytes.length;) {
        const marker = bytes.readUInt16BE(at);
        if (marker >= 0xffc0 && marker <= 0xffc2) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
        at += 2 + bytes.readUInt16BE(at + 2);
    }
    throw new Error('No frame header');
}

test('the rock photographs are in the repository: square 1k JPEGs, light enough for the web', () => {
    for (const [name, photo] of Object.entries(SCENERY_TEXTURES)) {
        for (const path of [photo.map, photo.normal]) {
            const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
            assert.deepEqual(jpegSize(bytes), [1024, 1024], path);
            assert.ok(bytes.length < 400 * 1024, `${path} is ${(bytes.length / 1024).toFixed(0)} KB`);
        }
        assert.ok(photo.metres > 1 && photo.metres < 5, `${name} is drawn at its real size`);
    }
});
