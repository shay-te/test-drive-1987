/** Longest frame step the simulation takes, so a stalled tab doesn't teleport the car. */
const MAX_FRAME = 1 / 20;

/** Runs the frame loop and switches between the screens registered by name. */
export class Game {
    constructor(services, screens) {
        this.services = { ...services, game: this };
        this.screens = screens;
        this.screen = null;
        this.lastTime = null;
    }

    start(name) {
        this.go(name);
        requestAnimationFrame((time) => {
            this._frame(time);
        });
    }

    /** Leaves the current screen and enters screen `name` with `params`. */
    go(name, params = {}) {
        this.screen?.exit?.();
        this.screen = new this.screens[name](this.services);
        this.screen.enter?.(params);
    }

    _frame(time) {
        const dt = this.lastTime === null ? 0 : Math.min(MAX_FRAME, (time - this.lastTime) / 1000);
        this.lastTime = time;
        const { input, display, audio } = this.services;
        input.poll();
        if (input.pressed('mute')) audio.toggleMute();
        this.screen.update(dt);
        display.beginFrame();
        this.screen.render(display.ctx);
        input.endFrame();
        requestAnimationFrame((next) => {
            this._frame(next);
        });
    }
}
