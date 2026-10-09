import { ROAD } from '../config.js';
import { Noise, clamp, lerp } from '../util/math.js';
import { roadsideAt, routeGround } from './routeTerrain.js';
import { normalize } from '../util/vector.js';

/** Terrain grid spacing and how far it reaches beyond the road (m). */
const CELL = 40;
const MARGIN = 600;
const SAMPLE_STEP = 4;
/** Lateral zone covered by the detailed road-side ribbons; the heightfield ducks underneath. */
export const MOUNTAIN_NEAR = 62;
export const VALLEY_NEAR = 52;
/** Ground at or below the sea's surface is sea floor, this deep. */
export const SEA_LEVEL = 0;
export const SEA_DEPTH = 20;
/** The sea floor shelves away from the shore this steeply (m down per m out), gently enough for a
 *  sunk car to settle on; at the shoreline it lies SHORE_DEPTH under the surface. */
const SEA_SHELF = 0.5;
const SHORE_DEPTH = 0.5;
/** The gravel shoulders fall away from the asphalt by this much at their outer edge. */
export const SHOULDER_DROP = 0.06;
/** Where the drop beyond the edge is sampled (m out), and how far its lip dips at the edge itself. */
const DROP_OUT = [0, 1.5, 3, 4.5, 6, 7.5, 9, 12, 15, 18, 21, 24, 28, 32, 36, 40, 44];
const LIP = 0.05;
/** The drop as a road cross-section, outermost point first (its heights come from the route). */
const DROP_SECTION = [...DROP_OUT].reverse().map((out) => {
    return { u: ROAD.edgeOffset - out, h: -LIP };
});
/** Rock relief on the drop face: noise scale and how deep it carves. */
const RELIEF_SCALE = 0.05;
const RELIEF_DEPTH = 4;
const RELIEF_AMOUNT = 0.35;
const NORMAL_STEP = 0.25;

/** Upward unit normal at (x, z) of any `ground` with heightAt(x, z), by central differences. */
export function groundNormal(ground, x, z) {
    const dx = ground.heightAt(x + NORMAL_STEP, z) - ground.heightAt(x - NORMAL_STEP, z);
    const dz = ground.heightAt(x, z + NORMAL_STEP) - ground.heightAt(x, z - NORMAL_STEP);
    return normalize({ x: -dx, y: 2 * NORMAL_STEP, z: -dz });
}

/** The ground of a stage: road and shoulders, the drop below the edge, and the real terrain of the
 *  route beyond (the sea floor under the water). The renderer builds its meshes from it and a car
 *  going over the edge lands on it. */
export class Landscape {
    constructor(track, stage) {
        this.track = track;
        this.noise = new Noise(stage.seed + 17);
        this.reliefNoise = new Noise(stage.seed + 99);
        this.cell = CELL;
        this.waterLevel = SEA_LEVEL;
        const b = track.bounds;
        this.x0 = b.minX - MARGIN;
        this.z0 = b.minZ - MARGIN;
        this.nx = Math.ceil((b.maxX - b.minX + 2 * MARGIN) / CELL) + 1;
        this.nz = Math.ceil((b.maxZ - b.minZ + 2 * MARGIN) / CELL) + 1;
        this.heights = new Float32Array(this.nx * this.nz);
        this.sides = new Float32Array(this.nx * this.nz);
        this.dropSections = Array.from({ length: track.count }, (_, i) => { return this._dropSection(i); });
        this.hint = 0;
        this._computeHeights();
    }

    /** Ground height under world point (x, z): whichever surface is on top, as it is drawn. */
    heightAt(x, z) {
        const p = this.track.project(x, z, this.hint);
        this.hint = p.i;
        return Math.max(this._roadside(p), this.terrainAt(x, z));
    }

    /** Upward unit normal of the ground at (x, z). */
    normalAt(x, z) {
        return groundNormal(this, x, z);
    }

    /** Vertical relief carved into the drop face at world (x, z), `depth` metres below the road. */
    relief(x, z, depth) {
        const n = this.reliefNoise.fbm3(x * RELIEF_SCALE, 7.1, z * RELIEF_SCALE, 3);
        return n * clamp(depth, 0, RELIEF_DEPTH) * RELIEF_AMOUNT;
    }

    /** The drop at node `i`: the real ground beyond the edge down to the shore, then the sea floor
     *  shelving away under the water; at the edge itself, the profile's lip. */
    _dropSection(i) {
        const t = this.track;
        const road = t.elevation[i];
        let shore = Infinity;
        return [...DROP_SECTION].reverse().map(({ u, h }) => {
            const out = ROAD.edgeOffset - u;
            if (out === 0) return { u, h };
            const ground = road + roadsideAt(t, i, -1, out);
            if (ground <= SEA_LEVEL) shore = Math.min(shore, out);
            const depth = Math.min(SEA_DEPTH, (out - shore) * SEA_SHELF);
            return { u, h: (out < shore ? ground : SEA_LEVEL - depth) - road };
        }).reverse();
    }

    /** The terrain mesh's surface: two triangles per grid cell, split like three.js's PlaneGeometry. */
    terrainAt(x, z) {
        const gx = clamp((x - this.x0) / CELL, 0, this.nx - 1.0001);
        const gz = clamp((z - this.z0) / CELL, 0, this.nz - 1.0001);
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);
        const fx = gx - ix;
        const fz = gz - iz;
        const h = (a, c) => {
            return this.heights[(iz + c) * this.nx + ix + a];
        };
        if (fx + fz <= 1) return h(0, 0) + (h(1, 0) - h(0, 0)) * fx + (h(0, 1) - h(0, 0)) * fz;
        return h(1, 1) + (h(0, 1) - h(1, 1)) * (1 - fx) + (h(1, 0) - h(1, 1)) * (1 - fz);
    }

    /** Bilinear height at fractional grid coordinates (placing trees). */
    gridHeight(ix, iz) {
        const x = clamp(Math.floor(ix), 0, this.nx - 2);
        const z = clamp(Math.floor(iz), 0, this.nz - 2);
        const fx = ix - x;
        const fz = iz - z;
        const h = (a, c) => {
            return this.heights[(z + c) * this.nx + x + a];
        };
        return lerp(lerp(h(0, 0), h(1, 0), fx), lerp(h(0, 1), h(1, 1), fx), fz);
    }

    /** Height of the road-side ribbons (road, shoulders, the drop) at road position p, as drawn. */
    _roadside({ s, u, i }) {
        const t = this.track;
        const fs = clamp(s / t.segment - i, 0, 1);
        const road = t.elevation[i] + (t.elevation[i + 1] - t.elevation[i]) * fs;
        if (u >= -ROAD.halfWidth && u <= ROAD.halfWidth) return road;
        if (u > ROAD.halfWidth) {
            // Between nodes the face runs straight from one to the next, as its ribbon is drawn.
            const wall = lerp(t.wallOffset[i], t.wallOffset[i + 1], fs) + 0.4;
            if (u > wall) return road + lerp(t.wallHeight[i], t.wallHeight[i + 1], fs);
            return road - lerp(0.01, SHOULDER_DROP, (u - ROAD.halfWidth) / (wall - ROAD.halfWidth));
        }
        if (u >= ROAD.edgeOffset) {
            return (
                road - lerp(0.01, SHOULDER_DROP, (-ROAD.halfWidth - u) / (-ROAD.halfWidth - ROAD.edgeOffset))
            );
        }
        return this._drop(i, fs, u);
    }

    /** The drop ribbon: the same vertices (with relief) and the same triangle split as its mesh. */
    _drop(i, fs, u) {
        const section = DROP_SECTION;
        if (u < section[0].u) return -Infinity;
        let j = 0;
        while (j < section.length - 2 && u > section[j + 1].u) j++;
        const fu = clamp((u - section[j].u) / (section[j + 1].u - section[j].u), 0, 1);
        const vertex = (row, col) => {
            const { h } = this.dropSections[i + row][col];
            const p = this.track.nodeWorld(i + row, section[col].u, h, {});
            return p.y + this.relief(p.x, p.z, -h);
        };
        const h00 = vertex(0, j);
        const h10 = vertex(1, j);
        const h01 = vertex(0, j + 1);
        const h11 = vertex(1, j + 1);
        if (fs + fu <= 1) return h00 + (h10 - h00) * fs + (h01 - h00) * fu;
        return h11 + (h01 - h11) * (1 - fs) + (h10 - h11) * (1 - fu);
    }

    _computeHeights() {
        const t = this.track;
        const samples = [];
        for (let i = 0; i < t.count; i += SAMPLE_STEP) samples.push(i);
        for (let iz = 0; iz < this.nz; iz++) {
            for (let ix = 0; ix < this.nx; ix++) {
                const x = this.x0 + ix * CELL;
                const z = this.z0 + iz * CELL;
                let best = samples[0];
                let bestD = Infinity;
                for (const i of samples) {
                    const d = (x - t.px[i]) ** 2 + (z - t.pz[i]) ** 2;
                    if (d < bestD) {
                        bestD = d;
                        best = i;
                    }
                }
                const u =
                    (x - t.px[best]) * Math.cos(t.heading[best]) +
                    (z - t.pz[best]) * Math.sin(t.heading[best]);
                const k = iz * this.nx + ix;
                this.sides[k] = u;
                this.heights[k] = this._height(best, u);
            }
        }
        this._shelveSea();
    }

    /** Lays the sea floor under the water: deeper the further each vertex is from land (or from the
     *  road-side ribbons), by a two-pass chamfer distance over the grid. */
    _shelveSea() {
        const { nx, nz, heights, sides } = this;
        const sea = (k) => {
            return heights[k] <= SEA_LEVEL && (sides[k] > MOUNTAIN_NEAR || -sides[k] > VALLEY_NEAR);
        };
        const distance = Float32Array.from(heights, (_, k) => { return sea(k) ? Infinity : 0; });
        const straight = CELL;
        const diagonal = CELL * Math.SQRT2;
        const relax = (k, ix, iz, steps) => {
            for (const [dx, dz, d] of steps) {
                const x = ix + dx;
                const z = iz + dz;
                if (x >= 0 && x < nx && z >= 0 && z < nz) distance[k] = Math.min(distance[k], distance[z * nx + x] + d);
            }
        };
        const back = [[-1, 0, straight], [0, -1, straight], [-1, -1, diagonal], [1, -1, diagonal]];
        const ahead = [[1, 0, straight], [0, 1, straight], [1, 1, diagonal], [-1, 1, diagonal]];
        for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) relax(iz * nx + ix, ix, iz, back);
        for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) relax(iz * nx + ix, ix, iz, ahead);
        for (let k = 0; k < heights.length; k++) {
            // The shoreline runs through the cells next to land, a cell short of the first sea vertex.
            if (sea(k)) heights[k] = SEA_LEVEL - clamp((distance[k] - CELL) * SEA_SHELF, SHORE_DEPTH, SEA_DEPTH);
        }
    }

    /** Terrain at lateral offset `u` from road node `i`, under the road-side ribbons near the road. */
    _height(i, u) {
        const t = this.track;
        const roadY = t.elevation[i];
        if (u > 0) {
            if (u < MOUNTAIN_NEAR) return roadY - 25;
            return routeGround(t, i, u);
        }
        // Just under the drop's lowest point, so the ground beyond runs on from its foot.
        if (-u < VALLEY_NEAR) return roadY + Math.min(...this.dropSections[i].map((p) => { return p.h; })) - 1;
        return routeGround(t, i, u);
    }
}

