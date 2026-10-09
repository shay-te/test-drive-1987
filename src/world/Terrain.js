import * as THREE from 'three';
import { SEA_LEVEL } from '../sim/Landscape.js';
import { landUv } from './routeFrame.js';

/** The sea reaches this far from the stage (m), past the land drawn around it. */
const SEA_REACH = 60000;

/** The ground near the road in the colours Landsat saw, and the sea along it. */
export class Terrain {
    constructor(landscape, materials) {
        this.landscape = landscape;
        this.mesh = this._buildMesh(materials.land);
        this.sea = this._buildSea(materials.water);
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
            const [x, z] = [l.x0 + ix * l.cell, l.z0 + iz * l.cell];
            pos.setXYZ(k, x, l.heights[iz * l.nx + ix], z);
            uv.setXY(k, ...landUv(l.track, x, z));
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
