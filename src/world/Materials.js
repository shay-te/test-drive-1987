import * as THREE from 'three';
import { ROAD } from '../config.js';
import { LAND_DETAIL, SCENERY_TEXTURES } from '../data/scenery.js';
import { SPECIES } from '../data/forest.js';
import { withoutTiling } from './noTiling.js';
import { TRI_START, triplanarFragment, triplanarRock, triplanarVertex } from './triplanar.js';
import { t } from '../i18n/i18n.js';
import { font } from '../ui/theme.js';
import { linearGradient, multilineText, speckle } from '../util/canvas.js';
import { hexToRgb, mixRgb } from '../util/color.js';
import { createRng } from '../util/math.js';

/** The pictures of a branch spray, of needles or of leaves (along, across), and of a whole tree (across,
 *  up), in pixels; the silhouettes are painted in these greys and tinted tree by tree. */
const SPRAY_SIZE = [256, 128];
const SILHOUETTE_SIZE = [128, 256];
const SILHOUETTE_GREYS = ['#a8a8a8', '#c0c0c0', '#d8d8d8', '#f0f0f0'];
const NEEDLE_SEED = 41;
/** Leaves bigger than this (share of the spray) are palmate, like a maple's: five lobes over this
 *  spread (rad) from the stalk, the middle one longest. Smaller ones are ovate, this wide for their
 *  length. */
const LOBED_LEAF = 0.12;
const LOBES = [[-1.7, 0.5], [-0.85, 0.85], [0, 1], [0.85, 0.85], [1.7, 0.5]];
const OVATE = 0.36;
/** Side shoots stand this many leaf lengths apart along the twig, carry so many leaves each. */
const SHOOT_STEP = 0.3;
const LEAVES_PER_SHOOT = [2, 4];
/** A conifer silhouette's crown starts this share of the way down; a broadleaf one is so many blobs. */
const SILHOUETTE_CROWN = 0.8;
const SILHOUETTE_BLOBS = 160;
const GALVANISED_SIZE = 256;

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
        // Hot-dip galvanised rail, dulled and streaked by years of road spray; weathered timber posts.
        this.galvanised = new THREE.MeshStandardMaterial({
            map: this._texture('galvanised', GALVANISED_SIZE, GALVANISED_SIZE, drawGalvanised),
            roughness: 0.6,
            metalness: 0.25,
            side: THREE.DoubleSide,
        });
        this.timber = new THREE.MeshStandardMaterial({ color: '#6e604f', roughness: 0.95 });
        // Smooth enough to throw the low sun back as a glint.
        // Two-sided, so from under the water its surface closes the view above.
        this.water = new THREE.MeshStandardMaterial({ color: '#1f3d48', roughness: 0.14, metalness: 0.05, side: THREE.DoubleSide });
        this.post = new THREE.MeshStandardMaterial({
            map: this._texture('post', 32, 128, (ctx, w, h) => {
                drawDelineator(ctx, w, h);
            }),
            roughness: 0.6,
        });
        this.building = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
        // Rock fallen from the cut: the same granite, without the face's shading.
        this.boulder = triplanarRock(new THREE.MeshStandardMaterial({ roughness: 0.96 }), 'boulder', this._rockTextures(SCENERY_TEXTURES.rock), SCENERY_TEXTURES.rock.metres);
        // Each species' bark, and its foliage cut out of its picture (sprays of needles or clusters of
        // leaves), smoothed at the edges by the multisampling; far off, one silhouette per kind of tree.
        const foliage = (key, width, height, draw) => {
            return new THREE.MeshStandardMaterial({
                map: this._texture(key, width, height, draw, { repeat: false }),
                alphaTest: 0.5,
                alphaToCoverage: true,
                side: THREE.DoubleSide,
                roughness: 0.92,
            });
        };
        this.trees = Object.fromEntries(Object.entries(SPECIES).map(([name, species]) => {
            const conifer = species.kind === 'conifer';
            return [name, {
                bark: new THREE.MeshStandardMaterial({ color: species.bark, roughness: 1 }),
                foliage: foliage(`foliage:${name}`, SPRAY_SIZE[0], SPRAY_SIZE[1], (ctx, w, h) => {
                    if (conifer) drawSpray(ctx, w, h, species);
                    else drawLeafSpray(ctx, w, h, species);
                }),
            }];
        }));
        this.silhouettes = {
            conifer: foliage('silhouette:conifer', SILHOUETTE_SIZE[0], SILHOUETTE_SIZE[1], drawConiferSilhouette),
            broadleaf: foliage('silhouette:broadleaf', SILHOUETTE_SIZE[1], SILHOUETTE_SIZE[1], drawBroadleafSilhouette),
        };
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

/** Galvanised steel: a grey spangle of zinc crystals, darker streaks of dirt washed down the rail. */
function drawGalvanised(ctx, w, h) {
    ctx.fillStyle = '#c9cccd';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, { count: 2600, alpha: 0.12, size: 7, seed: 12 });
    speckle(ctx, w, h, { count: 9000, alpha: 0.18, size: 1.4, seed: 13, dark: 1 });
    const rng = createRng(14);
    for (let k = 0; k < 40; k++) {
        const x = rng() * w;
        ctx.fillStyle = linearGradient(ctx, 0, 0, 0, h, [
            [0, 'rgba(70,64,56,0)'],
            [1, `rgba(70,64,56,${rng.range(0.08, 0.22).toFixed(2)})`],
        ]);
        ctx.fillRect(x, h * rng.range(0.2, 0.6), rng.range(2, 8), h);
    }
}

/** Needles along a twig from (x, y) heading `angle`, `length` px, `needle` px long: shaded inside,
 *  fresher towards the tip, in `colors` (dark to fresh). */
function needleTwig(ctx, rng, x, y, angle, length, needle, colors) {
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

/** A branch spray seen from above, its twig from the trunk (left) to the tip (right): side twigs
 *  sweeping forward, widest a third of the way out, furred with the species' needles. */
function drawSpray(ctx, w, h, species) {
    const rng = createRng(NEEDLE_SEED);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    const needle = species.needle * w;
    needleTwig(ctx, rng, 0, mid, 0, w * 0.97, needle, species.foliage);
    for (let x = w * 0.08; x < w * 0.92; x += w * 0.06) {
        const reach = h * 0.42 * Math.sin(Math.PI * Math.min(1, (x / w) * 1.4)) * rng.range(0.75, 1.05);
        for (const side of [-1, 1]) needleTwig(ctx, rng, x, mid, side * rng.range(0.6, 0.9), reach, needle * 0.85, species.foliage);
    }
}

/** A leafy spray seen from above, its twig from the branch (left) to the tip (right): side shoots by
 *  turns either side, longest part-way out, each with leaves on stalks angled forward (alder's ovate,
 *  maple's broad and five-lobed), shaded inside the crown and fresher towards the tip. */
function drawLeafSpray(ctx, w, h, species) {
    const rng = createRng(NEEDLE_SEED + 2);
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    const size = species.leaf * w;
    const colors = species.foliage;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w * 0.92, mid);
    ctx.stroke();
    const leaves = [];
    let side = 1;
    for (let x = size * 0.3; x < w - size * 0.8; x += size * SHOOT_STEP * rng.range(0.8, 1.2), side = -side) {
        const out = x / w;
        const angle = side * rng.range(0.45, 1.05);
        const reach = (h / 2 - size * 0.5) * Math.sin(Math.PI * Math.min(1, 0.15 + out * 1.1)) * rng.range(0.55, 1);
        const [tx, ty] = [x + Math.cos(angle) * reach, mid + Math.sin(angle) * reach];
        ctx.lineWidth = Math.max(1, size * 0.04);
        ctx.beginPath();
        ctx.moveTo(x, mid);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        const count = Math.round(rng.range(...LEAVES_PER_SHOOT));
        for (let k = 0; k < count; k++) {
            const t = 1 - k * rng.range(0.3, 0.45);
            leaves.push({ x: x + (tx - x) * t, y: mid + (ty - mid) * t, angle: angle * rng.range(0.4, 1.2), out });
        }
    }
    leaves.push({ x: w * 0.92, y: mid, angle: rng.range(-0.2, 0.2), out: 1 });
    // The leaves inside the crown first, the sunlit tips over them.
    leaves.sort((a, b) => { return a.out - b.out; });
    for (const leaf of leaves) {
        const shade = Math.min(colors.length - 2, Math.floor(leaf.out * (colors.length - 1) * rng.range(0.6, 1.3)));
        drawLeaf(ctx, leaf.x, leaf.y, leaf.angle, size * rng.range(0.75, 1.15), species.leaf > LOBED_LEAF, [colors[shade], colors[shade + 1]], colors[0]);
    }
}

/** One leaf on its stalk from (x, y) heading `angle`, `length` px: palmate (`lobed`) or ovate, shaded
 *  from its base to its tip in `fill` (two colours), its veins in `vein`. */
function drawLeaf(ctx, x, y, angle, length, lobed, fill, vein) {
    const stalk = length * 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = vein;
    ctx.lineWidth = Math.max(1, length * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stalk, 0);
    ctx.stroke();
    ctx.translate(stalk, 0);
    const blade = length - stalk;
    const gradient = ctx.createLinearGradient(0, 0, blade, 0);
    gradient.addColorStop(0, fill[0]);
    gradient.addColorStop(1, fill[1]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (const [turn, share] of lobed ? LOBES : [[0, 1]]) {
        const lobe = blade * share;
        const half = lobe * (lobed ? 0.22 : OVATE / 2);
        const [c, s] = [Math.cos(turn), Math.sin(turn)];
        const at = (u, v) => { return [u * c - v * s, u * s + v * c]; };
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(...at(lobe * 0.35, -half * 2), ...at(lobe, 0));
        ctx.quadraticCurveTo(...at(lobe * 0.35, half * 2), 0, 0);
    }
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, length * 0.02);
    ctx.beginPath();
    for (const [turn, share] of lobed ? LOBES : [[0, 1]]) {
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(turn) * blade * share * 0.85, Math.sin(turn) * blade * share * 0.85);
    }
    ctx.stroke();
    ctx.restore();
}

/** A conifer as it shows from a distance: a dark spire of drooping branch sprays round a trunk. */
function drawConiferSilhouette(ctx, w, h) {
    const rng = createRng(NEEDLE_SEED + 1);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = SILHOUETTE_GREYS[0];
    ctx.lineWidth = w * 0.03;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
    for (let y = h * SILHOUETTE_CROWN; y > h * 0.01; y -= h * 0.018) {
        const reach = (w / 2) * (y / h / SILHOUETTE_CROWN) ** 0.9 * rng.range(0.75, 1.05);
        for (const side of [-1, 1]) {
            const angle = side > 0 ? rng.range(0.15, 0.45) : Math.PI - rng.range(0.15, 0.45);
            needleTwig(ctx, rng, w / 2, y, angle, reach, w * 0.05, SILHOUETTE_GREYS);
        }
    }
}

/** A broadleaf tree from a distance: a rounded crown of leaf clusters over a short trunk. */
function drawBroadleafSilhouette(ctx, w, h) {
    const rng = createRng(NEEDLE_SEED + 3);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = SILHOUETTE_GREYS[0];
    ctx.fillRect(w * 0.48, h * 0.6, w * 0.04, h * 0.4);
    for (let k = 0; k < SILHOUETTE_BLOBS; k++) {
        const angle = rng() * Math.PI * 2;
        const r = rng() ** 0.5;
        ctx.fillStyle = SILHOUETTE_GREYS[Math.floor(rng() * SILHOUETTE_GREYS.length)];
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(angle) * r * w * 0.38, h * 0.38 + Math.sin(angle) * r * h * 0.3, w * rng.range(0.05, 0.1), 0, Math.PI * 2);
        ctx.fill();
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
