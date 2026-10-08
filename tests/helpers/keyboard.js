import { InputManager } from '../../src/core/InputManager.js';

/** A real InputManager listening to a synthetic keyboard; `key(type, code)` dispatches one key event. */
export function keyboardInput() {
    const keyboard = new EventTarget();
    const input = new InputManager(keyboard, null);
    const key = (type, code) => {
        const event = new Event(type);
        event.code = code;
        event.key = code;
        keyboard.dispatchEvent(event);
    };
    return { keyboard, input, key };
}
