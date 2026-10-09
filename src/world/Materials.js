import * as THREE from 'three';
import { ROAD } from '../config.js';
import { FOREST, LAND_DETAIL, SCENERY_TEXTURES } from '../data/scenery.js';
import { withoutTiling } from './noTiling.js';
import { TRI_START, triplanarFragment, triplanarRock, triplanarVertex } from './triplanar.js';
import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import { linearGradient, multilineText, speckle } from '../util/canvas.js';
import { hexToRgb, mixRgb } from '../util/color.js';
import { createRng } from '../util/math.js';

/** The pictures of a branch spray (along, across) and of a whole tree (across, up), in pixels. */
const NEEDLES_SIZE = [256, 128];
const SILHOUETTE_SIZE = [128, 256];
const NEEDLE_SEED = 41;

/** Road texture covers both lanes and one 12 m dash period of the centre line. */
export const ROAD_TEXTURE_LENGTH = 12;

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
        this.rock = this._rockMaterial(SCENERY_TEXTURES.rock);
        // The land as Landsat 5 saw it in September 1987, over the route's surroundings, with real ground
        // photographed close up worked into it and bare rock wherever it is too steep to hold anything.
        this.land = new THREE.MeshStandardMaterial({ map: this._photo(stage.route.surroundings.image, true, false), roughness: 1 });
        this._landShader(this.land, this._photo(LAND_DETAIL.map, false), LAND_DETAIL.metres);
        this.steel = new THREE.MeshStandardMaterial({ color: '#c3c8ce', roughness: 0.42, metalness: 0.7 });
        // Smooth enough to throw the low sun back as a glint.
        // Two-sided, so from under the water its surface closes the view above.
        this.water = new THREE.MeshStandardMaterial({ color: '#1f3d48', roughness: 0.14, metalness: 0.05, side: THREE.DoubleSide });
        this.post = new THREE.MeshStandardMaterial({
            map: this._texture('post', 32, 128, (ctx, w, h) => {
                drawDelineator(ctx, w, h);
            }),
            roughness: 0.6,
        });
        this.wood = new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 0.9 });
        this.building = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
        // Branch sprays near by, whole silhouettes far off: cut out of their pictures, smoothed at the
        // edges by the multisampling.
        const foliage = (key, width, height, draw) => {
            return new THREE.MeshStandardMaterial({
                map: this._texture(key, width, height, draw, { repeat: false }),
                alphaTest: 0.5,
                alphaToCoverage: true,
                side: THREE.DoubleSide,
                roughness: 0.92,
            });
        };
        this.needles = foliage('needles', NEEDLES_SIZE[0], NEEDLES_SIZE[1], drawNeedles);
        this.treeSilhouette = foliage('silhouette', SILHOUETTE_SIZE[0], SILHOUETTE_SIZE[1], drawSilhouette);
        this.bark = new THREE.MeshStandardMaterial({ color: FOREST.colors.bark, roughness: 1 });
        // Rock fallen from the cut: the same granite, without the face's shading.
        this.boulder = triplanarRock(new THREE.MeshStandardMaterial({ roughness: 0.96 }), 'boulder', this._rockTextures(SCENERY_TEXTURES.rock), SCENERY_TEXTURES.rock.metres);
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

    /** A texture of the photograph at `path` (loaded by WorldView.prepareStage), tiled when `repeat`. */
    _photo(path, color, repeat = true) {
        const map = new THREE.Texture(this.resources.get(`image:${path}`));
        map.anisotropy = this.anisotropy;
        if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
        if (color) map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
        return map;
    }

    /** The textures of a rock photograph (`photo` from SCENERY_TEXTURES), tiled. */
    _rockTextures(photo) {
        return { map: this._photo(photo.map, true), normal: this._photo(photo.normal, false) };
    }

    /** Multiplies the grey `detail` photograph, laid flat over the world at a broad and a close scale
     *  (m), into `material`'s colour: crisp ground under colours that come only in 30 m pixels (each
     *  sample averages mid-grey, so twice each keeps the brightness). Where the ground is too steep to
     *  hold soil (LAND_DETAIL.bareRock) it turns to the weathered rock of SCENERY_TEXTURES.cliff. */
    _landShader(material, detail, [broad, close]) {
        const rock = SCENERY_TEXTURES.cliff;
        const [bare, soil] = LAND_DETAIL.bareRock.map((v) => { return v.toFixed(2); });
        const [fade, gone] = LAND_DETAIL.reach.map((v) => { return v.toFixed(1); });
        const floor = LAND_DETAIL.floor;
        const floorMap = this._photo(floor.map, true);
        withoutTiling(material, `land-${broad}-${close}`, (fragment, shader) => {
            shader.uniforms.detailMap = { value: detail };
            shader.uniforms.floorMap = { value: floorMap };
            triplanarVertex(shader, this._rockTextures(rock));
            const span = rock.metres.toFixed(2);
            return triplanarFragment(`uniform sampler2D detailMap;\nuniform sampler2D floorMap;\n${fragment}`)
                .replace('#include <map_fragment>', `#include <map_fragment>
    ${TRI_START}
    float bare = smoothstep(${soil}, ${bare}, triN.y);
    // Fine detail and photographed rock only where they can be seen; far off, their averages.
    float near = 1.0 - smoothstep(${fade}, ${gone}, length(vViewPosition));
    vec2 ground = vTriWorld.xz / ${broad.toFixed(1)};
    vec2 fine = vTriWorld.xz / ${close.toFixed(1)};
    vec2 fineDx = triDx.xz / ${close.toFixed(1)};
    vec2 fineDy = triDy.xz / ${close.toFixed(1)};
    vec3 land = diffuseColor.rgb * 2.0 * textureNoTile(detailMap, ground).r;
    if (near > 0.0) {
        vec3 detailed = land * 2.0 * textureNoTileGrad(detailMap, fine, fineDx, fineDy).r;
        vec3 forestFloor = textureNoTileGrad(floorMap, vTriWorld.xz / ${floor.metres.toFixed(2)}, triDx.xz / ${floor.metres.toFixed(2)}, triDy.xz / ${floor.metres.toFixed(2)}).rgb;
        land = mix(land, mix(detailed, forestFloor, ${floor.share.toFixed(2)}), near);
    }
    diffuseColor.rgb = land;
    vec3 rock = textureLod(rockMap, vec2(0.5), 16.0).rgb;
    if (near > 0.0 && bare > 0.0) rock = mix(rock, triplanarColor(rockMap, vTriWorld, triDx, triDy, triN, ${span}), near);
    diffuseColor.rgb = mix(diffuseColor.rgb, rock, bare);`)
                .replace('#include <clearcoat_normal_fragment_begin>', `if (near > 0.0 && bare > 0.0) normal = normalize(mix(normal, toView(triplanarNormal(rockNormal, vTriWorld, triDx, triDy, triN, ${span})), bare * near));
#include <clearcoat_normal_fragment_begin>`);
        });
    }

    /** Rock from a photograph (`photo` from SCENERY_TEXTURES), laid along the world's axes and shaded
     *  by the ribbon's vertex colours. */
    _rockMaterial(photo) {
        const material = new THREE.MeshStandardMaterial({ roughness: 0.96, vertexColors: true });
        return triplanarRock(material, photo.map, this._rockTextures(photo), photo.metres);
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

function drawDelineator(ctx, w, h) {
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h * 0.22);
    ctx.fillStyle = '#ffb21e';
    ctx.fillRect(w * 0.25, h * 0.06, w * 0.5, h * 0.1);
}

/** Needles along a twig from (x, y) heading `angle`, `length` px: dark inside, fresher green outside. */
function needleTwig(ctx, rng, x, y, angle, length, needle) {
    const colors = FOREST.colors.needles;
    ctx.lineCap = 'round';
    for (let d = 0; d < length; d += 1.5) {
        const px = x + Math.cos(angle) * d;
        const py = y + Math.sin(angle) * d;
        const fresh = d / length;
        for (const side of [-1, 1]) {
            const a = angle + side * rng.range(0.7, 1.2);
            const n = needle * rng.range(0.7, 1.1);
            ctx.strokeStyle = colors[Math.min(colors.length - 1, Math.floor(fresh * colors.length * rng.range(0.6, 1.2)))];
            ctx.lineWidth = rng.range(0.9, 1.6);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a) * n, py + Math.sin(a) * n);
            ctx.stroke();
        }
    }
}

/** A Douglas fir branch spray seen from above, its twig from the trunk (left) to the tip (right):
 *  side twigs sweeping forward, widest a third of the way out, each furred with needles. */
function drawNeedles(ctx, w, h) {
    const rng = createRng(NEEDLE_SEED);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    needleTwig(ctx, rng, 0, mid, 0, w * 0.97, h * 0.07);
    for (let x = w * 0.08; x < w * 0.92; x += w * 0.06) {
        const out = x / w;
        const reach = h * 0.42 * Math.sin(Math.PI * Math.min(1, out * 1.4)) * rng.range(0.75, 1.05);
        for (const side of [-1, 1]) needleTwig(ctx, rng, x, mid, side * rng.range(0.6, 0.9), reach, h * 0.06);
    }
}

/** A whole fir as it shows from a distance: a dark spire of drooping branch sprays round a trunk. */
function drawSilhouette(ctx, w, h) {
    const t = FOREST.tree;
    const rng = createRng(NEEDLE_SEED + 1);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = FOREST.colors.bark;
    ctx.lineWidth = w * 0.03;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
    // The card spans the crown's widest reach either side of the trunk.
    for (let y = h * (1 - t.crownBase); y > h * 0.01; y -= h * 0.018) {
        const up = 1 - y / h;
        const reach = (w / 2) * ((1 - up) / (1 - t.crownBase)) ** t.taper * rng.range(0.75, 1.05);
        for (const side of [-1, 1]) {
            const angle = side > 0 ? rng.range(0.15, 0.45) : Math.PI - rng.range(0.15, 0.45);
            needleTwig(ctx, rng, w / 2, y, angle, reach, w * 0.05);
        }
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
