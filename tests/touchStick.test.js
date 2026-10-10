import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICK } from '../src/config.js';
import { keyboardInput } from './helpers/keyboard.js';

const WIDTH = 800;

/** A real InputManager and a `touch(type, id, x, y)` that sends it one finger event on a phone-wide screen. */
function phone() {
    globalThis.innerWidth = WIDTH;
    const { keyboard, input } = keyboardInput();
    const touch = (type, id, x, y) => {
        const event = new Event(type);
        Object.assign(event, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, button: 0 });
        keyboard.dispatchEvent(event);
    };
    return { input, touch };
}

test('a thumb on the left makes a stick where it lands: right steers, up is gas, down is brake', () => {
    const { input, touch } = phone();
    touch('pointerdown', 1, 200, 300);
    assert.equal(input.steering(), 0);
    touch('pointermove', 1, 200 + STICK.radius, 300);
    assert.equal(input.steering(), 1);
    touch('pointermove', 1, 200, 300 - STICK.radius / 2);
    assert.equal(input.throttle(), 0.5);
    assert.equal(input.brake(), 0);
    touch('pointermove', 1, 200 - STICK.radius * 3, 300 + STICK.radius);
    assert.equal(input.steering(), -1, 'held at full lock past the rim');
    assert.equal(input.brake(), 1);
    assert.equal(input.throttle(), 0);
    touch('pointerup', 1, 200, 300);
    assert.equal(input.steering(), 0);
    assert.equal(input.brake(), 0);
});

test('a thumb that barely moves inside the dead zone steers and drives nothing', () => {
    const { input, touch } = phone();
    touch('pointerdown', 1, 100, 100);
    touch('pointermove', 1, 100 + STICK.radius * STICK.deadzone / 2, 100 - STICK.radius * STICK.deadzone / 2);
    assert.equal(input.steering(), 0);
    assert.equal(input.throttle(), 0);
});

test('the right half of the screen makes no stick', () => {
    const { input, touch } = phone();
    touch('pointerdown', 1, WIDTH * 0.75, 300);
    touch('pointermove', 1, WIDTH * 0.75 + STICK.radius, 300 - STICK.radius);
    assert.equal(input.steering(), 0);
    assert.equal(input.throttle(), 0);
});

test('a second finger on the left does not take over the stick', () => {
    const { input, touch } = phone();
    touch('pointerdown', 1, 200, 300);
    touch('pointerdown', 2, 100, 100);
    touch('pointermove', 2, 100 + STICK.radius, 100);
    assert.equal(input.steering(), 0);
    touch('pointermove', 1, 200 + STICK.radius, 300);
    assert.equal(input.steering(), 1);
});

test('flicking the stick across steps a menu once, and a tap confirms', () => {
    const { input, touch } = phone();
    touch('pointerdown', 1, 200, 300);
    touch('pointermove', 1, 200 + STICK.radius, 300);
    touch('pointermove', 1, 200 + STICK.radius * 0.9, 300);
    assert.equal(input.menuStep(), 1);
    assert.equal(input.pressed('confirm'), false, 'a flick is not a tap');
    input.endFrame();
    touch('pointerup', 1, 200, 300);
    assert.equal(input.menuStep(), 0);
    assert.equal(input.pressed('confirm'), false);
    touch('pointerdown', 3, 200, 300);
    touch('pointerup', 3, 200, 300);
    assert.equal(input.pressed('confirm'), true);
});
