import { FOREST } from '../data/forest.js';

/** Grid cell (m) the trunks are filed by. */
const CELL = 10;

/** The trunks of a stage's trees as a crashing car meets them: upright cylinders from the ground up,
 *  FOREST.trunkRadius thick per metre of height, filed by the grid cell they stand in. */
export class TreeTrunks {
    /** `placements`: [{ x, y, z, height }] as the forest planted them (y at the foot). */
    constructor(placements) {
        this.cells = new Map();
        this.widest = 0;
        for (const p of placements) {
            const trunk = { x: p.x, z: p.z, base: p.y, top: p.y + p.height, radius: p.height * FOREST.trunkRadius };
            this.widest = Math.max(this.widest, trunk.radius);
            const key = this._key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(trunk);
        }
    }

    _key(i, j) {
        return `${i},${j}`;
    }

    /** The trunks standing within `reach` m of (x, z) across the ground, and a few just beyond. */
    near(x, z, reach) {
        const r = reach + this.widest;
        const found = [];
        for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
            for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
                for (const trunk of this.cells.get(this._key(i, j)) ?? []) found.push(trunk);
            }
        }
        return found;
    }
}
