import * as THREE from 'three';
import { TRAFFIC_TYPES } from '../data/traffic.js';

const LIGHT_BAR_FLASH_HZ = 2.6;
const LIGHT_BAR_GLOW = { flash: 6, idle: 0.2 };
/** A flashing lens also shines as a glow this big on screen (share of the view's height) whatever its
 *  distance, as a light bar carries a long way even by day; the glow's picture is GLOW_PIXELS square. */
const GLOW_SIZE = 0.04;
const GLOW_PIXELS = 64;
const GLOW_COLORS = { red: '#ff2a1a', blue: '#2f5dff' };

/** Places the road users' authored models and flashes the patrol cars' light bars. */
export class VehicleModels {
    constructor(authored) {
        this.authored = authored;
        this.glow = null;
    }

    /** A new model for `vehicle`, sharing its type's geometry; local -z is its front. Light bar lenses get
     *  materials of their own to flash, and a glow each. */
    create(vehicle) {
        const spec = TRAFFIC_TYPES[vehicle.type];
        const group = this.authored.instance(spec.model);
        group.traverse((child) => {
            child.castShadow = true;
        });
        if (spec.lightBar) {
            group.updateMatrixWorld(true);
            const lens = (name, color) => {
                const mesh = group.getObjectByName(name);
                mesh.material = mesh.material.clone();
                const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: this._glowTexture(),
                    color,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    sizeAttenuation: false,
                }));
                mesh.geometry.computeBoundingBox();
                const centre = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
                glow.position.copy(group.worldToLocal(centre));
                glow.scale.setScalar(GLOW_SIZE);
                glow.visible = false;
                group.add(glow);
                return { material: mesh.material, glow };
            };
            group.userData.lightBar = { red: lens(spec.lightBar.red, GLOW_COLORS.red), blue: lens(spec.lightBar.blue, GLOW_COLORS.blue) };
            group.userData.siren = Boolean(vehicle.siren);
        }
        return group;
    }

    /** Flashes the patrol car light bar (red/blue alternating). */
    animate(group, time) {
        const bar = group.userData.lightBar;
        if (!bar) return;
        const phase = Math.floor(time * LIGHT_BAR_FLASH_HZ * 2) % 2;
        for (const [lens, on] of [[bar.red, phase === 0], [bar.blue, phase === 1]]) {
            const lit = group.userData.siren && on;
            lens.material.emissiveIntensity = lit ? LIGHT_BAR_GLOW.flash : LIGHT_BAR_GLOW.idle;
            lens.glow.visible = lit;
        }
    }

    /** A soft round glow, bright at its heart, made once and shared. */
    _glowTexture() {
        if (this.glow) return this.glow;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = GLOW_PIXELS;
        const ctx = canvas.getContext('2d');
        const half = GLOW_PIXELS / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GLOW_PIXELS, GLOW_PIXELS);
        this.glow = new THREE.CanvasTexture(canvas);
        return this.glow;
    }
}
