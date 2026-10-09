import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageLoader, stageLayout } from '../src/core/StageLoader.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape } from '../src/sim/Landscape.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { layOutStage, restoreStage, transferables } from '../src/sim/stageData.js';

test('a stage laid out as plain data (as a worker sends it) comes back exactly as if built here', () => {
    const laid = layOutStage(1);
    const sent = structuredClone(laid, { transfer: transferables(laid) });
    assert.equal(laid.track.curvature.length, 0, 'its arrays were handed over, not copied');
    const { stage, track, landscape } = restoreStage(sent);
    const built = buildTrack(STAGES[1]);
    const ground = new Landscape(built, STAGES[1]);
    assert.equal(stage, STAGES[1]);
    for (const name of ['curvature', 'elevation', 'wallOffset', 'wallHeight', 'rail', 'px', 'pz', 'heading']) {
        assert.deepEqual(track[name], built[name], name);
    }
    assert.deepEqual(track.props, built.props);
    assert.deepEqual(track.routeOrigin, built.routeOrigin);
    assert.deepEqual(landscape.heights, ground.heights);
    assert.deepEqual(landscape.dropSections[500], ground.dropSections[500]);
    const p = track.toWorld(track.startS + 300, -20);
    assert.equal(landscape.heightAt(p.x, p.z), ground.heightAt(p.x, p.z), 'the same ground under a falling car');
});

test('the loader prepares each stage once, with its downloads, and keeps only what it is told to', async () => {
    const asked = [];
    const world = { prepareStage(stage) { asked.push(stage.name); return Promise.resolve(); } };
    const loader = new StageLoader(world, stageLayout(null));
    const first = loader.prepare(0);
    assert.equal(loader.prepare(0), first, 'asked twice, prepared once');
    const ready = await first;
    assert.equal(ready.stage, STAGES[0]);
    assert.ok(ready.track.count > 0 && ready.landscape.heights.length > 0);
    assert.deepEqual(asked, [STAGES[0].name]);
    loader.prepare(1);
    loader.keep(1);
    assert.deepEqual([...loader.jobs.keys()], [1]);
});

test('a stage whose downloads fail is prepared afresh when asked again', async () => {
    let fail = true;
    const world = { prepareStage() { return fail ? Promise.reject(new Error('offline')) : Promise.resolve(); } };
    const loader = new StageLoader(world, stageLayout(null));
    await assert.rejects(loader.prepare(2), /offline/);
    fail = false;
    const ready = await loader.prepare(2);
    assert.equal(ready.stage, STAGES[2]);
});
