import { PHYS, WATER } from '../config.js';
import { TAU, createRng } from '../util/math.js';

/** The spray and bubbles of a car going into the sea: droplets thrown up by the splash fall back into
 *  it; bubbles of escaping air rise, wobbling and swelling, until they break the surface. */
export class WaterParticles {
    constructor(seaLevel, seed) {
        this.seaLevel = seaLevel;
        this.rng = createRng(seed);
        this.drops = [];
        this.bubbles = [];
        this.owed = 0;
    }

    /** A splash at `at` ({x, y, z}) for a car going in at `speed` (m/s). */
    splash(at, speed) {
        const { rng } = this;
        const count = Math.round(speed * WATER.splashPerSpeed);
        for (let i = 0; i < count; i++) {
            const angle = rng() * TAU;
            const out = rng.range(...WATER.splashOut);
            this.drops.push({
                x: at.x, y: this.seaLevel, z: at.z,
                vx: Math.cos(angle) * out, vy: rng.range(...WATER.splashUp), vz: Math.sin(angle) * out,
                size: rng.range(...WATER.dropSize),
            });
        }
    }

    /** Bubbles for `air` m3 escaping from a car whose centre is `at`. */
    bubble(at, air) {
        const { rng } = this;
        const [sx, sy, sz] = WATER.bubbleSpread;
        this.owed += air * WATER.bubblesPerAir;
        for (; this.owed >= 1; this.owed--) {
            this.bubbles.push({
                x: at.x + rng.range(-sx, sx), y: Math.min(at.y + rng.range(-sy, sy), this.seaLevel), z: at.z + rng.range(-sz, sz),
                size: rng.range(...WATER.bubbleSize), rise: rng.range(...WATER.rise),
                hz: rng.range(...WATER.wobble.hz), phase: rng() * TAU, age: 0,
            });
        }
    }

    update(dt) {
        for (const d of this.drops) {
            d.vy -= PHYS.g * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
        }
        this.drops = this.drops.filter((d) => { return d.y >= this.seaLevel || d.vy > 0; });
        for (const b of this.bubbles) {
            const before = this.seaLevel - b.y;
            b.age += dt;
            b.y += b.rise * dt;
            b.x += Math.sin(TAU * b.hz * b.age + b.phase) * WATER.wobble.amount * dt;
            // Gas swells as the water pressure on it falls.
            const air = WATER.atmosphere;
            b.size *= Math.cbrt((air + Math.max(0, before)) / (air + Math.max(0, this.seaLevel - b.y)));
        }
        this.bubbles = this.bubbles.filter((b) => { return b.y < this.seaLevel; });
    }

    clear() {
        this.drops = [];
        this.bubbles = [];
        this.owed = 0;
    }
}
