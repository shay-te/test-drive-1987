import { SMOKE } from '../config.js';
import { createRng } from '../util/math.js';

/** Smoke pouring from a blown engine: puffs born in the engine bay rise and drift with the wind,
 *  swelling and thinning out until they are gone. Each puff is { x, y, z, size, fade (0..1 left) }. */
export class EngineSmoke {
    constructor(seed) {
        this.rng = createRng(seed);
        this.puffs = [];
        this.owed = 0;
    }

    /** Advances `dt` s; while `burning`, new puffs come from world point `bay` ({ x, y, z }). */
    update(dt, bay, burning) {
        const { rng } = this;
        if (burning) {
            this.owed += SMOKE.rate * dt;
            for (; this.owed >= 1 && this.puffs.length < SMOKE.most; this.owed--) {
                const spread = () => { return rng.range(-SMOKE.spread, SMOKE.spread); };
                this.puffs.push({
                    x: bay.x, y: bay.y, z: bay.z,
                    vx: spread(), vy: rng.range(...SMOKE.rise), vz: spread(),
                    size: rng.range(...SMOKE.size), age: 0, life: rng.range(...SMOKE.life), fade: 1,
                });
            }
        }
        const [windX, windZ] = SMOKE.wind;
        for (const p of this.puffs) {
            p.age += dt;
            p.x += (p.vx + windX) * dt;
            p.y += p.vy * dt;
            p.z += (p.vz + windZ) * dt;
            p.size += SMOKE.grow * dt;
            p.fade = 1 - (p.age / p.life) ** SMOKE.thinning;
        }
        this.puffs = this.puffs.filter((p) => { return p.fade > 0; });
    }

    clear() {
        this.puffs = [];
        this.owed = 0;
    }
}
