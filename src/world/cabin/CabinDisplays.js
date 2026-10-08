import * as THREE from 'three';
import { ClusterFace } from '../../cockpit/ClusterFace.js';
import { CLUSTERS } from '../../cockpit/clusters.js';
import { paintTripDisplay } from '../../cockpit/tripDisplay.js';
import { CABIN } from './cabinLayout.js';

const TRIP_TEXELS = 3200;
const DIAL_GLOW = 0.45;

/** Owns the live instrument and trip-display textures shared by both cabin renderers. */
export class CabinDisplays {
    constructor(car, resources, anisotropy = 4, flipY = true) {
        this.face = new ClusterFace(resources, CLUSTERS[car.cockpit.cluster], car.cockpit.cluster);
        this.clusterTexture = new THREE.CanvasTexture(this.face.canvas);
        this.clusterTexture.flipY = flipY;
        this.clusterTexture.colorSpace = THREE.SRGBColorSpace;
        this.clusterTexture.anisotropy = anisotropy;
        this.clusterMaterial = new THREE.MeshStandardMaterial({
            map: this.clusterTexture,
            emissiveMap: this.clusterTexture,
            emissive: '#ffffff',
            emissiveIntensity: DIAL_GLOW,
            roughness: 0.5,
            envMapIntensity: 0.2,
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(CABIN.radio.display.w * TRIP_TEXELS);
        canvas.height = Math.round(CABIN.radio.display.h * TRIP_TEXELS);
        this.tripTexture = new THREE.CanvasTexture(canvas);
        this.tripTexture.flipY = flipY;
        this.tripTexture.colorSpace = THREE.SRGBColorSpace;
        this.tripMaterial = new THREE.MeshBasicMaterial({ map: this.tripTexture, toneMapped: false });
        this.lastTrip = '';
    }

    update(state, readings, lamps, tripLines) {
        this.face.paint(state, readings, lamps);
        this.clusterTexture.needsUpdate = true;
        const key = JSON.stringify(tripLines);
        if (key === this.lastTrip) return;
        this.lastTrip = key;
        const canvas = this.tripTexture.image;
        paintTripDisplay(canvas.getContext('2d'), canvas.width, canvas.height, tripLines);
        this.tripTexture.needsUpdate = true;
    }

    dispose() {
        this.clusterMaterial.dispose();
        this.tripMaterial.dispose();
        this.clusterTexture.dispose();
        this.tripTexture.dispose();
    }
}
