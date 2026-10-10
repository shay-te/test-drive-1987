import { STICK } from '../config.js';
import { clamp } from '../util/math.js';

/** A floating thumb stick: it appears where the thumb lands and reads the thumb's offset from there. */
export class TouchStick {
    constructor() {
        this.id = null;
        this.origin = { x: 0, y: 0 };
        this.x = 0;
        this.y = 0;
    }

    get active() {
        return this.id !== null;
    }

    begin(id, x, y) {
        this.id = id;
        this.origin = { x, y };
        this.x = 0;
        this.y = 0;
    }

    /** Moves the thumb to (x, y); the stick reads -1..1 across (+ right) and up (+ forward), the
     *  thumb's offset past the dead zone, a full deflection at `STICK.radius`. */
    move(x, y) {
        this.x = this._axis(x - this.origin.x);
        this.y = this._axis(this.origin.y - y);
    }

    end() {
        this.id = null;
        this.x = 0;
        this.y = 0;
    }

    /** The thumb's offset (px) from the origin, held at the stick's rim, for drawing the knob. */
    knob(x, y) {
        const dx = x - this.origin.x;
        const dy = y - this.origin.y;
        const reach = Math.hypot(dx, dy);
        const scale = reach > STICK.radius ? STICK.radius / reach : 1;
        return { x: dx * scale, y: dy * scale };
    }

    _axis(offset) {
        const value = clamp(offset / STICK.radius, -1, 1);
        return Math.abs(value) < STICK.deadzone ? 0 : value;
    }
}
