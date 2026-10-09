import * as THREE from 'three';
import { SMOKE } from '../config.js';
import { softDot } from './softDot.js';

/** A puff's density from its heart to its rim. */
const PUFF_STOPS = [[0, 1], [0.35, 0.75], [1, 0]];

/** Draws the smoke of a blown engine (EngineSmoke's puffs) as soft points, each its own size (m
 *  across, whatever the camera's field of view) and thinning out. */
export class Smoke {
    constructor(scene) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE.most * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SMOKE.most * 4), 4));
        geometry.setAttribute('puffSize', new THREE.BufferAttribute(new Float32Array(SMOKE.most), 1));
        const material = new THREE.PointsMaterial({
            map: softDot(PUFF_STOPS),
            size: 1,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
        });
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = `attribute float puffSize;\n${shader.vertexShader}`.replace('gl_PointSize = size;', 'gl_PointSize = size * puffSize * projectionMatrix[1][1];');
        };
        material.customProgramCacheKey = () => { return 'smoke'; };
        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.color = new THREE.Color(SMOKE.color);
        scene.add(this.points);
    }

    /** Shows `puffs` (EngineSmoke's). */
    update(puffs) {
        const g = this.points.geometry;
        const { position, color, puffSize } = g.attributes;
        puffs.forEach((p, i) => {
            position.setXYZ(i, p.x, p.y, p.z);
            color.setXYZW(i, this.color.r, this.color.g, this.color.b, SMOKE.opacity * p.fade);
            puffSize.setX(i, p.size);
        });
        g.setDrawRange(0, puffs.length);
        for (const attribute of [position, color, puffSize]) attribute.needsUpdate = true;
    }
}
