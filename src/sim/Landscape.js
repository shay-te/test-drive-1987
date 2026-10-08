import { ROAD } from '../config.js';
import { Noise, clamp, lerp, smoothstep } from '../util/math.js';
import { normalize } from '../util/vector.js';

/** Terrain grid spacing and how far it reaches beyond the road (m). */
const CELL = 40;
const MARGIN = 2400;
const SAMPLE_STEP = 4;
/** Lateral zone covered by the detailed road-side ribbons; the heightfield ducks underneath. */
export const MOUNTAIN_NEAR = 62;
export const VALLEY_NEAR = 52;
const VALLEY_DEPTH = 260;
/** The gravel shoulders fall away from the asphalt by this much at their outer edge. */
export const SHOULDER_DROP = 0.06;
/** Depth profile of the drop into the valley: [lateral offset beyond the edge, depth]. */
const DROP_PROFILE = [
    [0, 0.05],
    [0.3, 0.6],
    [0.9, 3],
    [2.2, 9],
    [4.5, 21],
    [8.5, 40],
    [16, 66],
    [28, 96],
    [44, 130],
];
/** The valley terrain meets the drop just below its last profile point. */
const DROP_FOOT = DROP_PROFILE.at(-1)[1] + 1;
/** Rock relief on the drop face: noise scale and how deep it carves. */
const RELIEF_SCALE = 0.05;
const RELIEF_DEPTH = 12;
const RELIEF_AMOUNT = 0.35;
const NORMAL_STEP = 0.25;

/** Upward unit normal at (x, z) of any `ground` with heightAt(x, z), by central differences. */
export function groundNormal(ground, x, z) {
    const dx = ground.heightAt(x + NORMAL_STEP, z) - ground.heightAt(x - NORMAL_STEP, z);
    const dz = ground.heightAt(x, z + NORMAL_STEP) - ground.heightAt(x, z - NORMAL_STEP);
    return normalize({ x: -dx, y: 2 * NORMAL_STEP, z: -dz });
}

/** The ground of a stage: road and shoulders, the drop below the edge, the mountain and valley
 *  beyond. The renderer builds its meshes from it and a car going over the edge lands on it. */
export class Landscape {
    constructor(track, stage) {
        this.track = track;
        this.noise = new Noise(stage.seed + 17);
        this.reliefNoise = new Noise(stage.seed + 99);
        this.valleyFloor = stage.startElevation - VALLEY_DEPTH;
        this.cell = CELL;
        const b = track.bounds;
        this.x0 = b.minX - MARGIN;
        this.z0 = b.minZ - MARGIN;
        this.nx = Math.ceil((b.maxX - b.minX + 2 * MARGIN) / CELL) + 1;
        this.nz = Math.ceil((b.maxZ - b.minZ + 2 * MARGIN) / CELL) + 1;
        this.heights = new Float32Array(this.nx * this.nz);
        this.sides = new Float32Array(this.nx * this.nz);
        this.dropSection = [...DROP_PROFILE].reverse().map(([out, depth]) => {
            return { u: ROAD.edgeOffset - out, h: -depth };
        });
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
        return n * Math.min(depth, RELIEF_DEPTH) * RELIEF_AMOUNT;
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
            const wall = t.wallOffset[i] + 0.4;
            if (u > wall) return road + t.wallHeight[i];
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
        const section = this.dropSection;
        if (u < section[0].u) return -Infinity;
        let j = 0;
        while (j < section.length - 2 && u > section[j + 1].u) j++;
        const fu = clamp((u - section[j].u) / (section[j + 1].u - section[j].u), 0, 1);
        const vertex = (row, col) => {
            const p = this.track.nodeWorld(i + row, section[col].u, section[col].h, {});
            return p.y + this.relief(p.x, p.z, -section[col].h);
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
                this.heights[k] = this._height(x, z, u, t.elevation[best], t.wallHeight[best]);
            }
        }
    }

    _height(x, z, u, roadY, wallHeight) {
        const n = this.noise;
        if (u > 0) {
            if (u < MOUNTAIN_NEAR) return roadY - 25;
            const peaks = n.ridged2(x * 0.0011, z * 0.0011) * 420 * smoothstep(80, 700, u);
            return roadY + wallHeight + 30 + (u - MOUNTAIN_NEAR) * 0.85 + peaks;
        }
        // The valley side starts at the foot of the drop and runs down from there, so a car that goes
        // over lands on a slope that carries it on down, not in a ditch under the face.
        const d = -u;
        const foot = roadY - DROP_FOOT;
        if (d < VALLEY_NEAR) return foot;
        const hills = n.fbm2(x * 0.002, z * 0.002, 4) * 35;
        const slope = foot - (d - VALLEY_NEAR) * 0.62;
        const farWall = n.ridged2(x * 0.0009 + 5, z * 0.0009) * 700 * smoothstep(1300, 2800, d);
        return Math.max(this.valleyFloor + hills, slope) + farWall;
    }
}
