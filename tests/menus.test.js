import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS, isLocked, neighbourCar } from '../src/data/cars.js';
import { SelectScreen } from '../src/ui/screens/SelectScreen.js';
import { TitleScreen } from '../src/ui/screens/TitleScreen.js';
import { keyboardInput } from './helpers/keyboard.js';

const FRAME = 1 / 60;
/** Web Audio cannot run in Node, so menu clicks go nowhere. */
const silentAudio = { unlock() { return Promise.resolve(); }, play() {} };
/** Brochure renders are DOM images; in Node they simply never finish loading. */
const pendingImages = { image() { return new Promise(() => {}); } };
/** Photographing models needs WebGL, so the menus get a world with no photos to offer. */
const offscreenWorld = { clear() {}, profile() { return null; } };

/** A real menu screen driven through a real InputManager, recording where it sends the game. */
function openMenu(Screen, params, world = offscreenWorld) {
    const { input, key } = keyboardInput();
    const visits = [];
    const screen = new Screen({
        game: { go(name, next) { visits.push([name, next]); } },
        audio: silentAudio,
        resources: pendingImages,
        input,
        world,
    });
    screen.enter(params);
    const press = (code) => {
        key('keydown', code);
        input.poll();
        screen.update(FRAME);
        input.endFrame();
        key('keyup', code);
    };
    return { screen, visits, press };
}

test('only the cars with an authored model are unlocked', () => {
    const unlocked = CARS.filter((car) => { return !isLocked(car); });
    assert.deepEqual(unlocked.map((car) => { return car.id; }), ['porsche', 'ferrari', 'lamborghini', 'lotus']);
});

test('stepping through the line-up wraps round at both ends', () => {
    assert.equal(neighbourCar(CARS[0], -1), CARS.at(-1));
    assert.equal(neighbourCar(CARS.at(-1), 1), CARS[0]);
    assert.equal(neighbourCar(CARS[0], 1), CARS[1]);
});

test('on the title the arrows choose the car and ENTER opens its brochure', () => {
    const { screen, visits, press } = openMenu(TitleScreen);
    assert.equal(screen.car.id, 'porsche');
    press('ArrowRight');
    assert.equal(screen.car.id, 'ferrari');
    press('Enter');
    assert.deepEqual(visits, [['select', { carId: 'ferrari' }]]);
});

test('the title photographs only the car on show, and the next one once it is chosen', () => {
    const asked = [];
    const { press } = openMenu(TitleScreen, {}, { clear() {}, profile(car) { asked.push(car.id); return null; } });
    assert.deepEqual(asked, ['porsche']);
    press('ArrowRight');
    assert.deepEqual(asked, ['porsche', 'ferrari']);
});

test('a locked car on the title goes no further', () => {
    const { screen, visits, press } = openMenu(TitleScreen);
    press('ArrowLeft');
    assert.equal(screen.car.id, 'corvette');
    press('Enter');
    assert.deepEqual(visits, []);
});

test('the title reopens on the car handed back by the brochure', () => {
    const { screen } = openMenu(TitleScreen, { carId: 'ferrari' });
    assert.equal(screen.car.id, 'ferrari');
});

test('the brochure refuses a test drive in a locked car', () => {
    const { screen, visits, press } = openMenu(SelectScreen, { carId: 'lotus' });
    press('ArrowRight');
    assert.equal(screen.car.id, 'corvette');
    press('Enter');
    assert.deepEqual(visits, []);
    press('ArrowLeft');
    press('Enter');
    assert.equal(visits.length, 1);
    assert.equal(visits[0][0], 'drive');
    assert.equal(visits[0][1].session.car.id, 'lotus');
});

test('leaving the brochure takes the chosen car back to the title', () => {
    const { visits, press } = openMenu(SelectScreen, { carId: 'ferrari' });
    press('Escape');
    assert.deepEqual(visits, [['title', { carId: 'ferrari' }]]);
});
