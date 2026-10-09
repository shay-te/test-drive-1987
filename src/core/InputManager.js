import { CABIN_VIEWS } from '../data/cabinViews.js';
import { LOOK } from '../config.js';
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
    lookUp: ['KeyR'],
    lookDown: ['KeyF'],
    centerLook: ['KeyC'],
    previewRadar: ['Digit8'],
    previewCrack: ['Digit9'],
    toggleDigital: ['KeyI'],
    toggleView: ['KeyV'],
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
    centerLook: [11],
    toggleView: [10],
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
        this.padLook = [0, 0];
        this.lookEnabled = false;
        this.pointerLook = { x: 0, y: 0 };
        this.drag = null;
        this.padTriggers = [0, 0];
        this.typed = [];
        // The same test the stylesheet uses to show the touch buttons.
        this.touch = Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
        target.addEventListener('keydown', (e) => {
            this._onKey(e, true);
        });
        target.addEventListener('keyup', (e) => {
            this._onKey(e, false);
        });
        target.addEventListener('blur', () => {
            this.keys.clear();
            this.touchActions.clear();
            this.drag = null;
            this.pointerLook = { x: 0, y: 0 };
        });
        this._bindTouch(touchRoot);
        this._bindLook(target);
    }

    setLookEnabled(enabled) {
        this.lookEnabled = enabled;
        this.drag = null;
        this.pointerLook = { x: 0, y: 0 };
    }

    _bindLook(target) {
        target.addEventListener('pointerdown', (event) => {
            if (event.target.closest?.('[data-action]')) return;
            if (this.lookEnabled && event.target.closest?.('canvas') && event.button === 0) {
                this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
                event.target.setPointerCapture?.(event.pointerId);
            } else this.pressedTouch.add('confirm');
        });
        target.addEventListener('pointermove', (event) => {
            if (!this.drag || this.drag.id !== event.pointerId) return;
            const dx = event.clientX - this.drag.x;
            const dy = event.clientY - this.drag.y;
            this.drag.x = event.clientX;
            this.drag.y = event.clientY;
            this.drag.distance += Math.hypot(dx, dy);
            this.pointerLook.x += dx;
            this.pointerLook.y += dy;
        });
        target.addEventListener('pointerup', (event) => {
            if (!this.drag || this.drag.id !== event.pointerId) return;
            if (this.drag.distance < LOOK.dragThreshold) this.pressedTouch.add('confirm');
            this.drag = null;
        });
        target.addEventListener('pointercancel', () => { this.drag = null; });
    }

    look() {
        const axis = (value) => { return Math.abs(value) > PAD_DEADZONE ? value : 0; };
        return {
            yaw: clamp((this.isDown('lookRight') ? 1 : 0) - (this.isDown('lookLeft') ? 1 : 0) + axis(this.padLook[0]), -1, 1),
            pitch: clamp((this.isDown('lookUp') ? 1 : 0) - (this.isDown('lookDown') ? 1 : 0) - axis(this.padLook[1]), -1, 1),
            pointerX: this.pointerLook.x,
            pointerY: this.pointerLook.y,
            center: this.pressed('centerLook'),
            view: CABIN_VIEWS.find((_, index) => { return this.pressedKeys.has(`Digit${index + 1}`); }),
        };
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
        this.padLook = pad ? [pad.axes[2] ?? 0, pad.axes[3] ?? 0] : [0, 0];
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

    /** Menu step pressed this frame: -1 left, 1 right, 0 none (keys, pad, or the touch steering buttons). */
    menuStep() {
        const left = this.pressed('left') || this.pressed('steerLeft');
        const right = this.pressed('right') || this.pressed('steerRight');
        return (right ? 1 : 0) - (left ? 1 : 0);
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

    /** On a touch screen, which has no keys to type with: a line of text from the device's own text
     *  box, '' if the player declines. */
    askText(question) {
        return globalThis.prompt?.(question) ?? '';
    }

    /** Printable characters typed since the last frame. */
    takeTyped() {
        const typed = this.typed;
        this.typed = [];
        return typed;
    }

    endFrame() {
        this.pointerLook.x = 0;
        this.pointerLook.y = 0;
        this.pressedKeys.clear();
        this.pressedTouch.clear();
    }
}
