import * as THREE from 'three';
import { createRng, lerp, smoothstep } from '../util/math.js';
import { MOUNTAIN_NEAR, VALLEY_NEAR } from '../sim/Landscape.js';
import { shadeVertex } from './Materials.js';
import { mixRgb } from '../util/color.js';

const FOREST_TREES = 5500;
const RING_INNER = 5200;
const RING_OUTER = 15000;

/** The mountain above the road, the valley below it and the ranges on the horizon. */
export class Terrain {
    constructor(landscape, stage, materials) {
        this.landscape = landscape;
        this.stage = stage;
        this.noise = landscape.noise;
        this.mesh = this._buildMesh(materials.terrain);
        this.ring = this._buildRing(materials.terrain);
    }

    /** World positions for forest trees on the valley side and the lower mountain. */
    treePlacements() {
        const rng = createRng(this.stage.seed + 71);
        const placements = [];
        const l = this.landscape;
        for (let attempt = 0; attempt < FOREST_TREES * 4 && placements.length < FOREST_TREES; attempt++) {
            const ix = rng() * (l.nx - 1);
            const iz = rng() * (l.nz - 1);
            const k = Math.round(iz) * l.nx + Math.round(ix);
            const side = l.sides[k];
            const distance = Math.abs(side);
            if (distance < (side < 0 ? VALLEY_NEAR + 15 : MOUNTAIN_NEAR + 10) || distance > 900) continue;
            if (this.noise.noise2(ix * 0.08, iz * 0.08) < -0.1) continue;
            placements.push({
                x: l.x0 + ix * l.cell,
                z: l.z0 + iz * l.cell,
                y: l.gridHeight(ix, iz) - 0.5,
                height: rng.range(9, 20),
            });
        }
        return placements;
    }

    _buildMesh(material) {
        const l = this.landscape;
        const geometry = new THREE.PlaneGeometry(
            (l.nx - 1) * l.cell,
            (l.nz - 1) * l.cell,
            l.nx - 1,
            l.nz - 1,
        );
        geometry.rotateX(-Math.PI / 2);
        const pos = geometry.attributes.position;
        const uv = geometry.attributes.uv;
        for (let k = 0; k < pos.count; k++) {
            const ix = k % l.nx;
            const iz = Math.floor(k / l.nx);
            pos.setXYZ(k, l.x0 + ix * l.cell, l.heights[iz * l.nx + ix], l.z0 + iz * l.cell);
            uv.setXY(k, ix * 0.6, iz * 0.6);
        }
        geometry.computeVertexNormals();
        this._paint(geometry, (k) => {
            return l.sides[k] < 0;
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
                smoothstep(
                    this.landscape.valleyFloor + 1500,
                    this.landscape.valleyFloor + 1900,
                    y + patch * 120,
                ) * smoothstep(0.5, 0.75, flat),
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
        const b = this.landscape.track.bounds;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        for (let k = 0; k < pos.count; k++) {
            const a = ((k % (around + 1)) / around) * Math.PI * 2;
            const f = Math.floor(k / (around + 1)) / radial;
            const r = lerp(RING_INNER, RING_OUTER, f);
            const x = cx + Math.cos(a) * r;
            const z = cz + Math.sin(a) * r;
            const ridge = this.noise.ridged2(Math.cos(a) * 3 + f * 2, Math.sin(a) * 3 + f * 2);
            const y = this.landscape.valleyFloor + 150 + ridge * 1500 * Math.sin(f * Math.PI) + f * 300;
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
