import * as THREE from 'three';
import { createRng } from '../util/math.js';
import { MOUNTAIN_NEAR, SEA_LEVEL, VALLEY_NEAR } from '../sim/Landscape.js';
import { latLonOf } from './routeFrame.js';

const FOREST_TREES = 5500;
/** Trees grow from this height above the sea. */
export const TREE_LINE_LOW = 3;
/** The sea reaches this far from the stage (m), past the land drawn around it. */
const SEA_REACH = 60000;

/** The ground near the road in the colours Landsat saw, and the sea along it. */
export class Terrain {
    constructor(landscape, stage, materials) {
        this.landscape = landscape;
        this.stage = stage;
        this.noise = landscape.noise;
        this.mesh = this._buildMesh(materials.land);
        this.sea = this._buildSea(materials.water);
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
            const y = l.gridHeight(ix, iz);
            if (y < SEA_LEVEL + TREE_LINE_LOW) continue;
            placements.push({ x: l.x0 + ix * l.cell, z: l.z0 + iz * l.cell, y: y - 0.5, height: rng.range(9, 20) });
        }
        return placements;
    }

    _buildMesh(material) {
        const l = this.landscape;
        const { south, north, west, east } = this.stage.route.surroundings;
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
            const [x, z] = [l.x0 + ix * l.cell, l.z0 + iz * l.cell];
            pos.setXYZ(k, x, l.heights[iz * l.nx + ix], z);
            const [lat, lon] = latLonOf(l.track, x, z);
            uv.setXY(k, (lon - west) / (east - west), (lat - south) / (north - south));
        }
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        return mesh;
    }

    /** The sea's surface out to the far ranges. */
    _buildSea(material) {
        const b = this.landscape.track.bounds;
        const geometry = new THREE.PlaneGeometry(SEA_REACH * 2, SEA_REACH * 2);
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((b.minX + b.maxX) / 2, SEA_LEVEL, (b.minZ + b.maxZ) / 2);
        mesh.receiveShadow = true;
        return mesh;
    }
}
