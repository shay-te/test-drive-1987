import * as THREE from 'three';
import { ROAD } from '../config.js';
import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import { linearGradient, multilineText, normalMapFromHeights, speckle } from '../util/canvas.js';
import { hexToRgb, mixRgb } from '../util/color.js';
import { Noise, clamp, smoothstep } from '../util/math.js';

/** Road texture covers both lanes and one 12 m dash period of the centre line. */
export const ROAD_TEXTURE_LENGTH = 12;
export const ROCK_TEXTURE_SIZE = 13;
const ROCK_PIXELS = 512;

/** Procedural textures and the shared three.js materials of a stage. */
export class WorldMaterials {
    constructor(resources, renderer, stage) {
        this.resources = resources;
        this.stage = stage;
        this.anisotropy = renderer.capabilities.getMaxAnisotropy();
        this.road = new THREE.MeshStandardMaterial({
            map: this._texture('asphalt', 512, 1024, (ctx, w, h) => {
                drawAsphalt(ctx, w, h);
            }),
            roughness: 0.93,
            metalness: 0,
        });
        this.gravel = new THREE.MeshStandardMaterial({
            map: this._texture('gravel', 256, 256, (ctx, w, h) => {
                drawGravel(ctx, w, h);
            }),
            roughness: 1,
        });
        this.rock = this._rockMaterial(stage.rock, 'rock');
        this.cliff = this._rockMaterial(stage.rockDark, 'cliff');
        this.terrain = new THREE.MeshStandardMaterial({
            vertexColors: true,
            map: this._texture('scrub', 256, 256, (ctx, w, h) => {
                drawScrub(ctx, w, h);
            }),
            roughness: 1,
        });
        this.steel = new THREE.MeshStandardMaterial({ color: '#c3c8ce', roughness: 0.42, metalness: 0.7 });
        // Smooth enough to throw the low sun back as a glint.
        this.water = new THREE.MeshStandardMaterial({ color: '#1f3d48', roughness: 0.14, metalness: 0.05 });
        this.post = new THREE.MeshStandardMaterial({
            map: this._texture('post', 32, 128, (ctx, w, h) => {
                drawDelineator(ctx, w, h);
            }),
            roughness: 0.6,
        });
        this.wood = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 0.9 });
        this.foliage = new THREE.MeshStandardMaterial({
            color: '#2e4a24',
            roughness: 0.95,
            flatShading: true,
        });
        this.bark = new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 });
        this.boulder = new THREE.MeshStandardMaterial({
            color: stage.rockDark,
            roughness: 0.95,
            flatShading: true,
        });
        this.signCache = new Map();
    }

    _texture(key, width, height, draw, { color = true, repeat = true } = {}) {
        const canvas = this.resources.canvas(`${key}:${this.stage.seed}`, width, height, draw);
        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = this.anisotropy;
        if (color) texture.colorSpace = THREE.SRGBColorSpace;
        if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    _rockMaterial(baseHex, key) {
        const heights = this.resources.memo('rock:heights', () => {
            return rockHeights(ROCK_PIXELS);
        });
        const map = this._texture(`${key}:${baseHex}`, ROCK_PIXELS, ROCK_PIXELS, (ctx, w, h) => {
            drawRock(ctx, w, h, heights, baseHex, this.stage.vegetation);
        });
        const normalMap = this._texture(
            'rock:normal',
            ROCK_PIXELS,
            ROCK_PIXELS,
            (ctx, w, h) => {
                normalMapFromHeights(ctx, heights, w, h, 5);
            },
            { color: false },
        );
        return new THREE.MeshStandardMaterial({
            map,
            normalMap,
            normalScale: new THREE.Vector2(1.4, 1.4),
            roughness: 0.96,
            vertexColors: true,
        });
    }

    /** Material for a road sign face of `kind` (see drawSign). */
    sign(kind, label = '') {
        const key = `${kind}:${label}`;
        if (!this.signCache.has(key)) {
            const map = this._texture(
                `sign:${key}`,
                256,
                256,
                (ctx, w, h) => {
                    drawSign(ctx, w, h, kind, label);
                },
                { repeat: false },
            );
            this.signCache.set(
                key,
                new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, roughness: 0.55 }),
            );
        }
        return this.signCache.get(key);
    }
}

// ------------------------------------------------------------------------- drawing

function drawAsphalt(ctx, w, h) {
    ctx.fillStyle = '#545559';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, { count: 26000, alpha: 0.32, size: 1.4, seed: 3 });
    const px = w / (ROAD.halfWidth * 2);
    // Polished wheel tracks, two per lane.
    for (const u of [-2.55, -1.05, 1.05, 2.55]) {
        const x = (u + ROAD.halfWidth) * px;
        ctx.fillStyle = linearGradient(ctx, x - 0.35 * px, 0, x + 0.35 * px, 0, [
            [0, 'rgba(20,20,22,0)'],
            [0.5, 'rgba(20,20,22,0.22)'],
            [1, 'rgba(20,20,22,0)'],
        ]);
        ctx.fillRect(x - 0.35 * px, 0, 0.7 * px, h);
    }
    // Sealed cracks.
    ctx.strokeStyle = 'rgba(15,15,16,0.55)';
    ctx.lineWidth = 2;
    for (const [x0, y0] of [
        [0.18, 0.2],
        [0.72, 0.62],
        [0.4, 0.86],
    ]) {
        ctx.beginPath();
        ctx.moveTo(x0 * w, y0 * h);
        for (let i = 1; i < 7; i++) ctx.lineTo((x0 + Math.sin(i * 2.1) * 0.05) * w, (y0 + i * 0.012) * h);
        ctx.stroke();
    }
    // Paint: solid edge lines, dashed centre line (3 m dash, 9 m gap).
    ctx.fillStyle = 'rgba(236,236,228,0.92)';
    const line = 0.11 * px;
    ctx.fillRect(0.05 * px, 0, line, h);
    ctx.fillRect(w - 0.05 * px - line, 0, line, h);
    ctx.fillRect(w / 2 - line / 2, 0, line, (3 / ROAD_TEXTURE_LENGTH) * h);
    speckle(ctx, w, h, { count: 5000, alpha: 0.35, size: 1.2, seed: 9, dark: 1 });
}

function drawGravel(ctx, w, h) {
    ctx.fillStyle = '#77716a';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, { count: 9000, alpha: 0.5, size: 2.2, seed: 5 });
}

function drawScrub(ctx, w, h) {
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, { count: 6000, alpha: 0.45, size: 3, seed: 11, dark: 0.8 });
}

function drawDelineator(ctx, w, h) {
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h * 0.22);
    ctx.fillStyle = '#ffb21e';
    ctx.fillRect(w * 0.25, h * 0.06, w * 0.5, h * 0.1);
}

/** Layered sedimentary rock: fbm relief, stepped strata ledges and long vertical fractures. */
function rockHeights(size) {
    const noise = new Noise(424242);
    const heights = new Float32Array(size * size);
    const period = 3;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Sample on a torus so the texture tiles seamlessly.
            const a = (x / size) * Math.PI * 2;
            const b = (y / size) * Math.PI * 2;
            const nx = Math.cos(a) * period;
            const nz = Math.sin(a) * period;
            const ny = Math.cos(b) * period;
            const nw = Math.sin(b) * period;
            const relief = noise.fbm3(nx + nw * 0.5, ny, nz - nw * 0.5, 5);
            const band = (y / size) * 5 + relief * 1.6;
            const ledge = smoothstep(0.7, 0.95, band - Math.floor(band)) * 0.12;
            const fracture = Math.pow(1 - Math.abs(noise.noise3(nx * 2.2 + 7, ny * 0.35, nz * 2.2)), 26);
            heights[y * size + x] = clamp(0.52 + relief * 0.5 - ledge - fracture * 0.3, 0, 1);
        }
    }
    return heights;
}

function drawRock(ctx, w, h, heights, baseHex, vegetationHex) {
    const base = mixRgb(hexToRgb(baseHex), [128, 120, 110], 0.18);
    const dark = mixRgb(base, [24, 20, 16], 0.62);
    const light = mixRgb(base, [228, 216, 196], 0.32);
    const moss = hexToRgb(vegetationHex);
    const noise = new Noise(77);
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        // Each stratum has its own tint.
        const tint = 0.9 + 0.2 * noise.noise1((y / h) * 9);
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const v = heights[i];
            let c = v < 0.5 ? mixRgb(dark, base, v * 2) : mixRgb(base, light, (v - 0.5) * 2);
            c = [c[0] * tint, c[1] * tint, c[2] * tint];
            if (v > 0.66 && noise.noise2(x * 0.05, y * 0.05) > 0.35) c = mixRgb(c, moss, 0.35);
            image.data.set([c[0], c[1], c[2], 255], i * 4);
        }
    }
    ctx.putImageData(image, 0, 0);
    // Water stains running down the face.
    for (let i = 0; i < 10; i++) {
        const x = ((i * 137) % w) + 5;
        ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [
            [0, 'rgba(25,18,12,0.2)'],
            [1, 'rgba(25,18,12,0)'],
        ]);
        ctx.fillRect(x, 0, 3 + (i % 4) * 2, h * (0.4 + (i % 5) * 0.12));
    }
}

const SIGN_STYLES = {
    speed55: {
        shape: 'rect',
        fill: '#f4f4ef',
        ink: '#111111',
        text: () => {
            return t('signs.speedLimit');
        },
        big: '55',
    },
    curveL: { shape: 'diamond', fill: '#f2c21a', ink: '#111111', arrow: -1 },
    curveR: { shape: 'diamond', fill: '#f2c21a', ink: '#111111', arrow: 1 },
    advisory: {
        shape: 'rect',
        fill: '#f2c21a',
        ink: '#111111',
        text: (label) => {
            return t('signs.advisory', { n: label });
        },
    },
    gas1mi: {
        shape: 'rect',
        fill: '#1d4f9c',
        ink: '#ffffff',
        text: () => {
            return t('signs.gas1mi');
        },
    },
    gasHalf: {
        shape: 'rect',
        fill: '#1d4f9c',
        ink: '#ffffff',
        text: () => {
            return t('signs.gasHalf');
        },
    },
    mile: {
        shape: 'rect',
        fill: '#1f6b3a',
        ink: '#ffffff',
        text: (label) => {
            return `${t('general.mile')}\n${label}`;
        },
    },
    summit: {
        shape: 'rect',
        fill: '#6b3f22',
        ink: '#f3e7cf',
        text: () => {
            return t('signs.summit');
        },
    },
    gasPole: {
        shape: 'rect',
        fill: '#c8201b',
        ink: '#ffffff',
        text: () => {
            return t('signs.station');
        },
        big: '89¢',
    },
    dealer: {
        shape: 'rect',
        fill: '#101010',
        ink: '#e8b21f',
        text: () => {
            return t('signs.dealer');
        },
    },
};

function drawSign(ctx, w, h, kind, label) {
    const style = SIGN_STYLES[kind];
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 10;
    ctx.strokeStyle = style.ink;
    ctx.fillStyle = style.fill;
    ctx.beginPath();
    if (style.shape === 'diamond') {
        ctx.moveTo(w / 2, 8);
        ctx.lineTo(w - 8, h / 2);
        ctx.lineTo(w / 2, h - 8);
        ctx.lineTo(8, h / 2);
        ctx.closePath();
    } else {
        ctx.roundRect(10, 10, w - 20, h - 20, 18);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = style.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.arrow) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(style.arrow, 1);
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-28, 52);
        ctx.quadraticCurveTo(-28, -30, 30, -34);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(30, -62);
        ctx.lineTo(62, -34);
        ctx.lineTo(30, -6);
        ctx.fill();
        ctx.restore();
        return;
    }
    const text = style.text(label);
    if (style.big) {
        ctx.font = font(40, 'ui', 'bold');
        multilineText(ctx, text, w / 2, h * 0.3, 42);
        ctx.font = font(96, 'ui', 'bold');
        ctx.fillText(style.big, w / 2, h * 0.7);
    } else {
        ctx.font = font(text.includes('\n') ? 52 : 60, 'ui', 'bold');
        multilineText(ctx, text, w / 2, h / 2, 58);
    }
}

/** Darkens a hex colour into a vertex-colour array entry. */
export function shadeVertex(hex, factor) {
    return mixRgb([0, 0, 0], hexToRgb(hex), factor).map((c) => {
        return c / 255;
    });
}
