import * as THREE from 'three';
import { normalMapFromHeights } from '../../util/canvas.js';
import { shadeHex } from '../../util/color.js';
import { createRng } from '../../util/math.js';

const GRAIN_PIXELS = 256;
/** Leather pebbles per texture tile, and how many tiles cover a metre. */
const GRAIN_CELLS = 40;
const GRAIN_REPEAT = 8;
/** Image-based light is the open sky; inside the cabin the roof hides most of it. */
const CABIN_ENV = 0.35;

/** The cabin's surfaces for one car: leather, plastics, carpet, glass, chrome and the body paint. */
export class CabinMaterials {
    constructor(car, resources, anisotropy) {
        const trim = car.cockpit.dash;
        const cabin = car.cockpit.cabin ?? {};
        const grain = this._grain(resources, anisotropy);
        const leather = (color, roughness = 0.7) => {
            return new THREE.MeshStandardMaterial({
                color,
                roughness,
                normalMap: grain,
                normalScale: new THREE.Vector2(0.3, 0.3),
                envMapIntensity: CABIN_ENV,
            });
        };
        const plain = (color, roughness, extra = {}) => {
            return new THREE.MeshStandardMaterial({ color, roughness, envMapIntensity: CABIN_ENV, ...extra });
        };
        this.dashTop = leather(trim.top);
        this.dashFace = leather(trim.face);
        this.panel = plain(trim.panel, 0.55);
        this.accent = plain(trim.accent, 0.5);
        this.rubber = plain('#0b0b0c', 0.92);
        this.headliner = plain(cabin.headliner ?? shadeHex(trim.top, 0.9), 0.95);
        this.carpet = plain(cabin.carpet ?? '#1a1a1c', 1);
        this.seat = leather(cabin.seat ?? trim.face, 0.75);
        this.wheel = leather(car.cockpit.wheel.rim, 0.55);
        this.spoke = leather(car.cockpit.wheel.spoke, 0.6);
        this.knob = plain(car.cockpit.shifter.knob, 0.35);
        this.chrome = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.16 });
        this.glass = new THREE.MeshStandardMaterial({
            color: '#0a0e12',
            roughness: 0.04,
            transparent: true,
            opacity: 0.05,
            side: THREE.DoubleSide,
            envMapIntensity: 0.5,
            depthWrite: false,
        });
        this.paint = new THREE.MeshPhysicalMaterial({
            color: car.paint,
            roughness: 0.38,
            metalness: 0.15,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
        });
        this.ledOff = plain('#2a0505', 0.4);
        this.ledOn = new THREE.MeshStandardMaterial({
            color: '#ff1a0a',
            emissive: '#ff1a0a',
            emissiveIntensity: 1.4,
        });
        this.power = new THREE.MeshStandardMaterial({
            color: '#9dff7a',
            emissive: '#9dff7a',
            emissiveIntensity: 2,
        });
    }

    /** Tangent-space normal map of pebbled leather (tileable cells), repeated across trimmed surfaces. */
    _grain(resources, anisotropy) {
        const canvas = resources.canvas('cabin:grain', GRAIN_PIXELS, GRAIN_PIXELS, (ctx, w, h) => {
            const rng = createRng(7);
            const cell = w / GRAIN_CELLS;
            const points = Array.from({ length: GRAIN_CELLS * GRAIN_CELLS }, (_, i) => {
                return [((i % GRAIN_CELLS) + rng()) * cell, (Math.floor(i / GRAIN_CELLS) + rng()) * cell];
            });
            const heights = new Float32Array(w * h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const cx = Math.floor(x / cell);
                    const cy = Math.floor(y / cell);
                    let nearest = Infinity;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const gx = (cx + dx + GRAIN_CELLS) % GRAIN_CELLS;
                            const gy = (cy + dy + GRAIN_CELLS) % GRAIN_CELLS;
                            const [px, py] = points[gy * GRAIN_CELLS + gx];
                            const ox = px + (cx + dx - gx) * cell - x;
                            const oy = py + (cy + dy - gy) * cell - y;
                            nearest = Math.min(nearest, ox * ox + oy * oy);
                        }
                    }
                    // Domed pebbles with creases between them.
                    heights[y * w + x] = 1 - Math.min(1, Math.sqrt(nearest) / cell);
                }
            }
            normalMapFromHeights(ctx, heights, w, h, 1.4);
        });
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(GRAIN_REPEAT, GRAIN_REPEAT);
        texture.anisotropy = anisotropy;
        return texture;
    }
}
