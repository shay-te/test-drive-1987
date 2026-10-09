import { ROAD } from '../config.js';
import { clamp } from '../util/math.js';

/** A stage of road sampled every `ROAD.segment` m. Road coords: s along, u lateral (+ towards the
 *  wall), h up. World coords are three.js: x right, y up, -z forward at heading 0. */
export class Track {
    /** `data` holds per-node arrays (curvature, elevation, wall*, rail) plus props, traps, finishS, and
     *  where the stage lies on its route: `routeStart` (its node 0) and `bearing` (compass deg at node 0). */
    constructor(data) {
        Object.assign(this, data);
        this.segment = ROAD.segment;
        this.count = data.curvature.length;
        this.length = (this.count - 1) * this.segment;
        this._integrate();
    }

    _integrate() {
        const n = this.count;
        this.heading = new Float32Array(n);
        this.px = new Float32Array(n);
        this.pz = new Float32Array(n);
        let psi = 0;
        let x = 0;
        let z = 0;
        for (let i = 0; i < n; i++) {
            this.heading[i] = psi;
            this.px[i] = x;
            this.pz[i] = z;
            const k = this.curvature[i];
            const mid = psi + (k * this.segment) / 2;
            x += Math.sin(mid) * this.segment;
            z -= Math.cos(mid) * this.segment;
            psi += k * this.segment;
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < n; i++) {
            minX = Math.min(minX, this.px[i]);
            maxX = Math.max(maxX, this.px[i]);
            minZ = Math.min(minZ, this.pz[i]);
            maxZ = Math.max(maxZ, this.pz[i]);
            minY = Math.min(minY, this.elevation[i]);
            maxY = Math.max(maxY, this.elevation[i]);
        }
        this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
    }

    /** Index of the segment containing `s` and the fraction within it. */
    locate(s) {
        const f = clamp(s / this.segment, 0, this.count - 1.0001);
        const i = Math.floor(f);
        return [i, f - i];
    }

    _lerpArray(arr, s) {
        const [i, f] = this.locate(s);
        return arr[i] + (arr[i + 1] - arr[i]) * f;
    }

    curvatureAt(s) {
        return this.curvature[this.locate(s)[0]];
    }

    elevationAt(s) {
        return this._lerpArray(this.elevation, s);
    }

    /** dy/ds of the road surface. */
    gradeAt(s) {
        const [i] = this.locate(s);
        return (this.elevation[i + 1] - this.elevation[i]) / this.segment;
    }

    headingAt(s) {
        const [i, f] = this.locate(s);
        return this.heading[i] + this.curvature[i] * f * this.segment;
    }

    wallOffsetAt(s) {
        return this._lerpArray(this.wallOffset, s);
    }

    wallHeightAt(s) {
        return this._lerpArray(this.wallHeight, s);
    }

    railAt(s) {
        return this.rail[this.locate(s)[0]] === 1;
    }

    /** Road coordinates -> world {x, y, z, heading}. */
    toWorld(s, u, h = 0, out = {}) {
        const [i, f] = this.locate(s);
        const psi = this.heading[i] + this.curvature[i] * f * this.segment;
        const cx = this.px[i] + (this.px[i + 1] - this.px[i]) * f;
        const cz = this.pz[i] + (this.pz[i + 1] - this.pz[i]) * f;
        out.x = cx + Math.cos(psi) * u;
        out.z = cz + Math.sin(psi) * u;
        out.y = this.elevation[i] + (this.elevation[i + 1] - this.elevation[i]) * f + h;
        out.heading = psi;
        return out;
    }

    /** Road coordinates {s, u, i} of world point (x, z), searching from node `hint` (the last answer). */
    project(x, z, hint = 0) {
        let i = clamp(hint, 0, this.count - 2);
        let along = 0;
        let last = 0;
        for (let step = 0; step < this.count; step++) {
            const psi = this.heading[i];
            along = (x - this.px[i]) * Math.sin(psi) - (z - this.pz[i]) * Math.cos(psi);
            const dir = along < 0 && i > 0 ? -1 : along >= this.segment && i < this.count - 2 ? 1 : 0;
            // Outside a bend two neighbouring sections can both disown a point: stop rather than swing.
            if (dir === 0 || dir === -last) break;
            last = dir;
            i += dir;
        }
        const psi = this.heading[i];
        const u = (x - this.px[i]) * Math.cos(psi) + (z - this.pz[i]) * Math.sin(psi);
        return { s: i * this.segment + clamp(along, 0, this.segment), u, i };
    }

    /** World position of node `i` offset laterally by `u` (fast path for mesh building). */
    nodeWorld(i, u, h, out) {
        const psi = this.heading[i];
        out.x = this.px[i] + Math.cos(psi) * u;
        out.z = this.pz[i] + Math.sin(psi) * u;
        out.y = this.elevation[i] + h;
        return out;
    }
}
