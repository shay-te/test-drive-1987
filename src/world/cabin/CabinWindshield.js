import * as THREE from 'three';
import { drawCrack } from '../../cockpit/Windshield.js';
import { VIEW } from '../../config.js';

const CRACK_HEIGHT = 480;

/** Owns a transparent windshield-damage overlay over an existing UV-mapped glass mesh. */
export class CabinWindshield {
    constructor(geometry, flipY = true) {
        const canvas = document.createElement('canvas');
        canvas.width = VIEW.width;
        canvas.height = CRACK_HEIGHT;
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.flipY = flipY;
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
            map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }));
        this.mesh.renderOrder = 2;
        this.mesh.visible = false;
        this.seed = null;
    }

    update(crack) {
        this.mesh.visible = crack !== null;
        if (!crack || crack.seed === this.seed) return;
        this.seed = crack.seed;
        const canvas = this.texture.image;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawCrack(ctx, crack);
        this.texture.needsUpdate = true;
    }

    dispose() {
        this.texture.dispose();
        this.mesh.material.dispose();
    }
}
