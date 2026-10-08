import { clamp } from '../util/math.js';

/** Keys of the 1987 PC version (arrows + A/Z) plus a few modern conveniences. */
const KEY_BINDINGS = {
    steerLeft: ['ArrowLeft'],
    steerRight: ['ArrowRight'],
    throttle: ['ArrowUp'],
    brake: ['ArrowDown'],
    shiftUp: ['KeyA', 'ShiftLeft'],
    shiftDown: ['KeyZ', 'ControlLeft'],
    confirm: ['Enter', 'Space', 'NumpadEnter'],
    back: ['Escape', 'Backspace'],
    pause: ['KeyP'],
    mute: ['KeyM'],
    lookLeft: ['KeyQ'],
    lookRight: ['KeyE'],
    toggleDigital: ['KeyI'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
};

/** Standard-mapping gamepad buttons. */
const PAD_BUTTONS = {
    confirm: [0, 9],
    back: [1],
    pause: [9],
    shiftUp: [5, 3],
    shiftDown: [4, 2],
    up: [12],
    down: [13],
    left: [14],
    right: [15],
};
const PAD_DEADZONE = 0.15;

/** Turns keyboard, gamepad and touch controls into game actions (held, pressed this frame). */
export class InputManager {
    constructor(target, touchRoot) {
        this.keys = new Set();
        this.pressedKeys = new Set();
        this.touchActions = new Set();
        this.pressedTouch = new Set();
        this.padButtons = [];
        this.prevPadButtons = [];
        this.padAxes = [0, 0];
        this.padTriggers = [0, 0];
        this.typed = [];
        target.addEventListener('keydown', (e) => {
            this._onKey(e, true);
        });
        target.addEventListener('keyup', (e) => {
            this._onKey(e, false);
        });
        target.addEventListener('blur', () => {
            this.keys.clear();
        });
        this._bindTouch(touchRoot);
        // A click or tap anywhere outside the touch buttons confirms (menus, "press ENTER").
        target.addEventListener('pointerdown', (e) => {
            if (!e.target.closest?.('[data-action]')) this.pressedTouch.add('confirm');
        });
    }

    _onKey(event, down) {
        if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
        if (down) {
            if (!this.keys.has(event.code)) this.pressedKeys.add(event.code);
            this.keys.add(event.code);
            if (event.key.length === 1) this.typed.push(event.key);
        } else {
            this.keys.delete(event.code);
        }
    }

    _bindTouch(root) {
        if (!root) return;
        for (const button of root.querySelectorAll('[data-action]')) {
            const action = button.dataset.action;
            const release = () => {
                this.touchActions.delete(action);
            };
            button.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                button.setPointerCapture(e.pointerId);
                this.touchActions.add(action);
                this.pressedTouch.add(action);
            });
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
        }
    }

    /** Samples the gamepad once per frame. */
    poll() {
        const pad = navigator.getGamepads?.().find(Boolean);
        this.prevPadButtons = this.padButtons;
        this.padButtons = pad
            ? pad.buttons.map((b) => {
                  return b.pressed;
              })
            : [];
        this.padAxes = pad ? [pad.axes[0] ?? 0, pad.axes[1] ?? 0] : [0, 0];
        this.padTriggers = pad ? [pad.buttons[6]?.value ?? 0, pad.buttons[7]?.value ?? 0] : [0, 0];
    }

    isDown(action) {
        return (
            (KEY_BINDINGS[action] ?? []).some((code) => {
                return this.keys.has(code);
            }) ||
            (PAD_BUTTONS[action] ?? []).some((i) => {
                return this.padButtons[i];
            }) ||
            this.touchActions.has(action)
        );
    }

    /** True on the frame the action was first pressed. */
    pressed(action) {
        return (
            (KEY_BINDINGS[action] ?? []).some((code) => {
                return this.pressedKeys.has(code);
            }) ||
            (PAD_BUTTONS[action] ?? []).some((i) => {
                return this.padButtons[i] && !this.prevPadButtons[i];
            }) ||
            this.pressedTouch.has(action)
        );
    }

    /** Steering -1 (left) .. 1 (right). */
    steering() {
        const keys = (this.isDown('steerRight') ? 1 : 0) - (this.isDown('steerLeft') ? 1 : 0);
        const stick = Math.abs(this.padAxes[0]) > PAD_DEADZONE ? this.padAxes[0] : 0;
        return clamp(keys + stick, -1, 1);
    }

    throttle() {
        return Math.max(this.isDown('throttle') ? 1 : 0, this.padTriggers[1], this.padAxes[1] < -0.5 ? 1 : 0);
    }

    brake() {
        return Math.max(this.isDown('brake') ? 1 : 0, this.padTriggers[0], this.padAxes[1] > 0.5 ? 1 : 0);
    }

    /** Printable characters typed since the last frame. */
    takeTyped() {
        const typed = this.typed;
        this.typed = [];
        return typed;
    }

    endFrame() {
        this.pressedKeys.clear();
        this.pressedTouch.clear();
    }
}
