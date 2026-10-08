import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio/AudioManager.js';
import { ResourceManager } from '../src/core/ResourceManager.js';

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
}

const WEB_AUDIO = { AudioContext: FakeContext, GainNode: FakeNode, DynamicsCompressorNode: FakeNode };

test('unlocking again before the first unlock finishes builds a single audio graph', async (t) => {
    Object.assign(globalThis, WEB_AUDIO);
    t.after(() => { for (const name of Object.keys(WEB_AUDIO)) delete globalThis[name]; });
    const audio = new AudioManager(new ResourceManager());
    await Promise.all([audio.unlock(), audio.unlock()]);
    assert.equal(FakeContext.created, 1);
    assert.ok(Object.values(audio.buses).every((bus) => { return bus.context === audio.context; }));
    await audio.unlock();
    assert.equal(FakeContext.created, 1, 'a later unlock only resumes');
});
