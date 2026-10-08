import * as THREE from 'three';
import { Noise, clamp, createRng, lerp, smoothstep } from '../util/math.js';
import { shadeVertex } from './Materials.js';
import { mixRgb } from '../util/color.js';

const CELL = 40;
const MARGIN = 2400;
const SAMPLE_STEP = 4;
/** Lateral zone covered by the detailed road-side ribbons; the heightfield ducks underneath. */
const MOUNTAIN_NEAR = 62;
const VALLEY_NEAR = 52;
const VALLEY_DEPTH = 260;
const FOREST_TREES = 5500;
const RING_INNER = 5200;
const RING_OUTER = 15000;

/** The mountain above the road, the valley below it and the ranges on the horizon. */
export class Terrain {
    constructor(track, stage, materials) {
        this.track = track;
        this.stage = stage;
        this.noise = new Noise(stage.seed + 17);
        this.valleyFloor = stage.startElevation - VALLEY_DEPTH;
        const b = track.bounds;
        this.x0 = b.minX - MARGIN;
        this.z0 = b.minZ - MARGIN;
        this.nx = Math.ceil((b.maxX - b.minX + 2 * MARGIN) / CELL) + 1;
        this.nz = Math.ceil((b.maxZ - b.minZ + 2 * MARGIN) / CELL) + 1;
        this.heights = new Float32Array(this.nx * this.nz);
        this.sides = new Float32Array(this.nx * this.nz);
        this._computeHeights();
        this.mesh = this._buildMesh(materials.terrain);
        this.ring = this._buildRing(materials.terrain);
    }

    /** World positions for forest trees on the valley side and the lower mountain. */
    treePlacements() {
        const rng = createRng(this.stage.seed + 71);
        const placements = [];
        for (let attempt = 0; attempt < FOREST_TREES * 4 && placements.length < FOREST_TREES; attempt++) {
            const ix = rng() * (this.nx - 1);
            const iz = rng() * (this.nz - 1);
            const k = Math.round(iz) * this.nx + Math.round(ix);
            const side = this.sides[k];
            const distance = Math.abs(side);
            if (distance < (side < 0 ? VALLEY_NEAR + 15 : MOUNTAIN_NEAR + 10) || distance > 900) continue;
            if (this.noise.noise2(ix * 0.08, iz * 0.08) < -0.1) continue;
            placements.push({
                x: this.x0 + ix * CELL,
                z: this.z0 + iz * CELL,
                y: this.heightAt(ix, iz) - 0.5,
                height: rng.range(9, 20),
            });
        }
        return placements;
    }

    /** Bilinear height at fractional grid coordinates. */
    heightAt(ix, iz) {
        const x = clamp(Math.floor(ix), 0, this.nx - 2);
        const z = clamp(Math.floor(iz), 0, this.nz - 2);
        const fx = ix - x;
        const fz = iz - z;
        const h = (a, c) => {
            return this.heights[(z + c) * this.nx + x + a];
        };
        return lerp(lerp(h(0, 0), h(1, 0), fx), lerp(h(0, 1), h(1, 1), fx), fz);
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
        const d = -u;
        if (d < VALLEY_NEAR) return roadY - 140;
        const hills = n.fbm2(x * 0.002, z * 0.002, 4) * 35;
        const slope = roadY - 120 - (d - VALLEY_NEAR) * 0.62;
        const farWall = n.ridged2(x * 0.0009 + 5, z * 0.0009) * 700 * smoothstep(1300, 2800, d);
        return Math.max(this.valleyFloor + hills, slope) + farWall;
    }

    _buildMesh(material) {
        const geometry = new THREE.PlaneGeometry(
            (this.nx - 1) * CELL,
            (this.nz - 1) * CELL,
            this.nx - 1,
            this.nz - 1,
        );
        geometry.rotateX(-Math.PI / 2);
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        for (let k = 0; k < pos.count; k++) {
            const ix = k % this.nx;
            const iz = Math.floor(k / this.nx);
            pos.setXYZ(k, this.x0 + ix * CELL, this.heights[iz * this.nx + ix], this.z0 + iz * CELL);
            uv.setXY(k, ix * 0.6, iz * 0.6);
        }
        geometry.computeVertexNormals();
        this._paint(geometry, (k) => {
            return this.sides[k] < 0;
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        return mesh;
    }

    /** Vertex colours: rock on steep faces, scrub and forest below the tree line, snow up high. */
    _paint(geometry, isValley) {
        const s = this.stage;
        const rock = shadeVertex(s.rock, 0.85);
        const forest = shadeVertex(s.vegetation, 0.7);
        const field = shadeVertex(s.vegetation, 1.15);
        const snow = [0.93, 0.95, 0.98];
        const pos = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const colors = new Float32Array(pos.count * 3);
        for (let k = 0; k < pos.count; k++) {
            const y = pos.getY(k);
            const flat = normal.getY(k);
            const patch = this.noise.noise2(pos.getX(k) * 0.004, pos.getZ(k) * 0.004);
            let c = isValley(k) && patch > 0.15 ? field : forest;
            c = mixRgb(rock, c, smoothstep(0.62, 0.85, flat));
            c = mixRgb(
                c,
                snow,
                smoothstep(this.valleyFloor + 1500, this.valleyFloor + 1900, y + patch * 120) *
                    smoothstep(0.5, 0.75, flat),
            );
            colors.set(c, k * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    /** Distant ranges all around, fading into the haze. */
    _buildRing(material) {
        const radial = 14;
        const around = 160;
        const geometry = new THREE.PlaneGeometry(1, 1, around, radial);
        const pos = geometry.attributes.position;
        const b = this.track.bounds;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        for (let k = 0; k < pos.count; k++) {
            const a = ((k % (around + 1)) / around) * Math.PI * 2;
            const f = Math.floor(k / (around + 1)) / radial;
            const r = lerp(RING_INNER, RING_OUTER, f);
            const x = cx + Math.cos(a) * r;
            const z = cz + Math.sin(a) * r;
            const ridge = this.noise.ridged2(Math.cos(a) * 3 + f * 2, Math.sin(a) * 3 + f * 2);
            const y = this.valleyFloor + 150 + ridge * 1500 * Math.sin(f * Math.PI) + f * 300;
            pos.setXYZ(k, x, y, z);
        }
        geometry.computeVertexNormals();
        this._paint(geometry, () => {
            return false;
        });
        const ringMaterial = material.clone();
        ringMaterial.side = THREE.DoubleSide;
        return new THREE.Mesh(geometry, ringMaterial);
    }
}
