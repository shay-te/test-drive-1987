import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../src/audio/AudioManager.js';
import { ResourceManager } from '../src/core/ResourceManager.js';
import { carById } from '../src/data/cars.js';
import { Session } from '../src/sim/Session.js';
import { DriveScreen } from '../src/ui/screens/DriveScreen.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape } from '../src/sim/Landscape.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { keyboardInput } from './helpers/keyboard.js';
import { aimedOffTheEdge, findPlunge } from './helpers/plunge.js';

const FRAME = 1 / 60;
/** The 3D world needs WebGL, so the drive screen gets one that only accepts calls. */
const offscreenWorld = { prepare() { return null; }, load() {}, render() {}, clear() {} };

/** A real drive screen on a real stage, played through a real InputManager. */
function startStage(carId = 'porsche', world = offscreenWorld) {
    const { input, key } = keyboardInput();
    const screen = new DriveScreen({
        game: { go() {} },
        audio: new AudioManager(new ResourceManager()),
        input,
        world,
    });
    screen.enter({ session: new Session(carById(carId)) });
    const run = (seconds) => {
        for (let t = 0; t < seconds; t += FRAME) {
            input.poll();
            screen.update(FRAME);
            // render() draws the loading notice (it needs a canvas); the stage builds after it.
            screen.loadingShown = true;
            input.endFrame();
        }
    };
    const tap = (code) => {
        key('keydown', code);
        run(FRAME);
        key('keyup', code);
    };
    run(FRAME * 2);
    return { screen, key, run, tap };
}

test('holding the throttle in neutral pulls away in first gear', () => {
    const { screen, key, run } = startStage();
    assert.equal(screen.vehicle.engine.gear, 0);
    key('keydown', 'ArrowUp');
    run(3);
    assert.equal(screen.vehicle.engine.gear, 1);
    assert.ok(screen.vehicle.speedMph > 15, `only ${screen.vehicle.speedMph.toFixed(1)} mph`);
});

test('rolling in neutral, the throttle only revs the engine', () => {
    const { screen, key, run, tap } = startStage();
    key('keydown', 'ArrowUp');
    run(2);
    tap('KeyZ');
    run(1);
    assert.equal(screen.vehicle.engine.gear, 0);
});

test('near the redline below top gear the driver is told to shift up, and the hint clears after A', () => {
    const { screen, key, run, tap } = startStage();
    key('keydown', 'ArrowUp');
    run(0.5);
    let waited = 0;
    while (!screen.shiftHint && waited < 10) {
        run(0.1);
        waited += 0.1;
    }
    assert.ok(screen.shiftHint, 'no shift hint before the redline');
    tap('KeyA');
    run(0.5);
    assert.equal(screen.vehicle.engine.gear, 2);
    assert.equal(screen.shiftHint, false);
});


test('driving waits for model preparation and advances only after the asset is ready', async () => {
    let complete;
    let calls = 0;
    const preparation = new Promise((resolve) => { complete = resolve; });
    const { screen, run } = startStage('porsche', {
        ...offscreenWorld,
        prepare() { calls++; return preparation; },
    });
    run(1);
    assert.equal(calls, 1);
    assert.equal(screen.state, 'loading');
    assert.equal(screen.session.stageTime, 0);
    complete(null);
    await preparation;
    assert.equal(screen.state, 'driving');
    run(1);
    assert.ok(screen.session.stageTime > 0);
});

test('leaving during preparation does not build a late cabin or resurrect the drive', async () => {
    let complete;
    const preparation = new Promise((resolve) => { complete = resolve; });
    const { screen } = startStage('porsche', { ...offscreenWorld, prepare() { return preparation; } });
    screen.exit();
    complete(null);
    await preparation;
    assert.equal(screen.vehicle, undefined);
    assert.equal(screen.input.lookEnabled, false);
});

test('V switches between the driver seat and the outside view, which the next stage keeps', () => {
    const { screen, tap } = startStage();
    assert.equal(screen.view.outside, false);
    tap('KeyV');
    assert.equal(screen.view.outside, true);
    tap('KeyV');
    assert.equal(screen.view.outside, false);
    const visits = [];
    const next = new DriveScreen({ game: { go(name, params) { visits.push([name, params]); } }, audio: screen.audio, input: screen.input, world: screen.world });
    next.enter({ session: new Session(carById('porsche')), outside: true });
    assert.equal(next.outside, true);
});

test('hitting a car plays the crash out, watched from outside, before the notice; then the wreck is cleared', () => {
    const { screen, run, tap } = startStage();
    const { vehicle } = screen;
    const truck = screen.traffic.add('truck', { s: vehicle.s + 12, u: vehicle.u, dir: -1, speed: 0, scripted: true });
    vehicle.vx = 30;
    run(1);
    assert.equal(screen.state, 'wrecking', 'no freeze-frame: the crash plays');
    assert.ok(screen.view.spectator, 'seen from beside the road');
    assert.ok(truck.wrecked && truck.pose, 'the truck follows its own wreck');
    assert.ok(screen.cracks.length > 0, 'the windshield cracked');
    assert.equal(screen.traffic.collision(truck.s, truck.u), null, 'the wreck no longer counts as traffic');
    for (let t = 0; t < 12 && screen.state === 'wrecking'; t++) run(1);
    assert.equal(screen.state, 'crashed', 'the notice comes once the cars settle');
    tap('Enter');
    assert.equal(screen.state, 'driving');
    assert.ok(!screen.traffic.vehicles.includes(truck), 'the wreck is cleared away');
    assert.deepEqual(screen.cracks, [], 'a fresh windshield');
});

test('over the edge into Howe Sound: a splash, the camera follows the car under, and the notice says how deep it sank', () => {
    const { screen, run, tap } = startStage();
    const track = buildTrack(STAGES[0]);
    const { node } = findPlunge(track, new Landscape(track, STAGES[0]), 1);
    const played = [];
    const play = screen.audio.play.bind(screen.audio);
    screen.audio.play = (name, options) => {
        played.push(name);
        return play(name, options);
    };
    const aimed = aimedOffTheEdge(screen.track, node);
    screen.vehicle.reset(aimed.s, aimed.u);
    Object.assign(screen.vehicle, { vx: aimed.vx, theta: aimed.theta });
    screen.vehicle.engine.gear = aimed.engine.gear;
    let underwater = false;
    for (let t = 0; t < 40 && screen.state !== 'crashed'; t += 0.5) {
        run(0.5);
        underwater ||= screen.view.underwater;
    }
    assert.equal(screen.cause, 'edge');
    assert.ok(played.includes('splash') && played.includes('bubbles'), played.join());
    assert.ok(underwater, 'watched from under the water');
    assert.ok(screen.view.water.bubbles.length > 0 || screen.wreck.body.flooded === 1, 'air bubbling out');
    assert.match(screen._fallStats(), /Howe Sound/);
    tap('Enter');
    assert.equal(screen.state, 'driving');
    assert.equal(screen.view.underwater, false, 'back on the road');
    assert.equal(screen.water.drops.length + screen.water.bubbles.length, 0, 'the sea is calm again');
});
