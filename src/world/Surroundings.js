import * as THREE from 'three';
import { SEA_DEPTH, SEA_LEVEL } from '../sim/Landscape.js';
import { worldOf } from './routeFrame.js';

/** Under the detailed ground near the road the distant land sinks this far, out of sight (m). */
const SUNK = 40;

/** The land around the stage out to the horizon, at its real heights and in the colours Landsat saw:
 *  the islands of the sound, the ranges either side and the peaks to the north. */
export class Surroundings {
    /** `heights`: the route's surroundings grid (Int16Array, metres, north row first). */
    constructor(track, landscape, heights, material) {
        const { south, north, west, east, rows, columns } = track.stage.route.surroundings;
        const l = landscape;
        const inside = (x, z) => {
            return x > l.x0 + l.cell && x < l.x0 + (l.nx - 2) * l.cell && z > l.z0 + l.cell && z < l.z0 + (l.nz - 2) * l.cell;
        };
        const positions = new Float32Array(rows * columns * 3);
        const uvs = new Float32Array(rows * columns * 2);
        for (let row = 0; row < rows; row++) {
            const v = 1 - row / (rows - 1);
            const lat = south + v * (north - south);
            for (let col = 0; col < columns; col++) {
                const u = col / (columns - 1);
                const k = row * columns + col;
                const { x, z } = worldOf(track, lat, west + u * (east - west));
                const ground = heights[k] > SEA_LEVEL ? heights[k] : SEA_LEVEL - SEA_DEPTH;
                positions.set([x, inside(x, z) ? ground - SUNK : ground, z], k * 3);
                uvs.set([u, v], k * 2);
            }
        }
        const index = new Uint32Array((rows - 1) * (columns - 1) * 6);
        let at = 0;
        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < columns - 1; col++) {
                const k = row * columns + col;
                index.set([k, k + columns, k + 1, k + 1, k + columns, k + columns + 1], at);
                at += 6;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        geometry.computeVertexNormals();
        this.mesh = new THREE.Mesh(geometry, material);
    }
}
