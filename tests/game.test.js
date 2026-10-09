import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../src/config.js';
import { Game } from '../src/core/Game.js';

/** A screen that records the dt it is given. */
class RecordingScreen {
    constructor() {
        this.dts = [];
    }

    update(dt) {
        this.dts.push(dt);
    }

    render() {}
}

/** The frame loop schedules its next frame through requestAnimationFrame; `_frame` is called directly
 *  here with chosen timestamps, so a real one is never needed, but the global must exist to be called.
 *  Runs `body(game)` with it stubbed, then restores it. */
function withGame(body) {
    const restoreRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => {};
    try {
        const input = { poll() {}, pressed() { return false; }, endFrame() {} };
        const display = { beginFrame() {}, ctx: {} };
        const audio = { toggleMute() {} };
        const game = new Game({ input, display, audio }, { drive: RecordingScreen });
        game.go('drive');
        body(game);
    } finally {
        globalThis.requestAnimationFrame = restoreRaf;
    }
}

test('a stalled tab (a huge gap between frames) never hands the screen more than GAME.maxFrame at once', () => {
    withGame((game) => {
        game._frame(0);
        game._frame(10000); // a 10 s gap, as after a backgrounded tab
        assert.equal(game.screen.dts.length, 2);
        assert.equal(game.screen.dts[1], GAME.maxFrame);
    });
});

test('an ordinary slow frame (still above GAME.maxFrame\'s floor) advances the sim by its real duration, not in slow motion', () => {
    withGame((game) => {
        // A 60 ms frame (under 17 fps) is a real dip, not a stall: GAME.maxFrame must cover it.
        const slowFrame = 0.06;
        assert.ok(slowFrame < GAME.maxFrame, 'the gate for this test needs a slower floor than 60 ms');
        game._frame(0);
        game._frame(slowFrame * 1000);
        assert.equal(game.screen.dts[1], slowFrame);
    });
});
