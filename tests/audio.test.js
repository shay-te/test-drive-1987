import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio/AudioManager.js';
import { readFileSync } from 'node:fs';
import { ResourceManager } from '../src/core/ResourceManager.js';

/** The game's files read from disk, as the browser would fetch them. */
class DiskResources extends ResourceManager {
    _fetch(path) {
        return Promise.resolve(new Response(readFileSync(path)));
    }
}

/** Web Audio cannot run in Node: the smallest graph that knows which context each node belongs to. */
class FakeNode {
    constructor(context) {
        this.context = context;
    }

    connect(target) {
        if (target.context !== this.context) throw new Error('Cannot connect nodes of different audio contexts');
        return target;
    }
}

class FakeContext {
    static created = 0;

    constructor() {
        FakeContext.created++;
        this.destination = new FakeNode(this);
        this.audioWorklet = { addModule: () => { return new Promise((resolve) => { setTimeout(resolve, 5); }); } };
    }

    resume() {
        return Promise.resolve();
    }

    decodeAudioData(bytes) {
        return Promise.resolve({ length: bytes.byteLength });
    }
}

const WEB_AUDIO = { AudioContext: FakeContext, GainNode: FakeNode, DynamicsCompressorNode: FakeNode };

test('unlocking again before the first unlock finishes builds a single audio graph', async (t) => {
    Object.assign(globalThis, WEB_AUDIO);
    t.after(() => { for (const name of Object.keys(WEB_AUDIO)) delete globalThis[name]; });
    const audio = new AudioManager(new DiskResources());
    await Promise.all([audio.unlock(), audio.unlock()]);
    assert.equal(FakeContext.created, 1);
    assert.ok(Object.values(audio.buses).every((bus) => { return bus.context === audio.context; }));
    await audio.unlock();
    assert.equal(FakeContext.created, 1, 'a later unlock only resumes');
    assert.deepEqual(Object.keys(audio.recorded).sort(), ['crack', 'crash', 'impact'], 'the recorded effects are ready');
});
