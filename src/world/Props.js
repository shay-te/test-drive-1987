import * as THREE from 'three';
import { ROAD } from '../config.js';
import { SCENERY_MODELS } from '../data/scenery.js';
import { Noise, createRng } from '../util/math.js';

const POST_SPACING = 6;
/** Broken rock: a sphere `radius` m across bumped out and in by up to `roughness` of it, squashed to
 *  `squat` of its height; one shape per seed in `shapes`. */
const BOULDER = { radius: 0.6, detail: 2, roughness: 0.32, frequency: 1.6, squat: 0.7, shapes: [11, 23, 37] };
const SIGN_SIZE = 0.95;

/** Roadside objects: delineator posts, boulders, signs, the gas station and the summit dealership. */
export function buildProps(track, materials, stage, authored) {
    const group = new THREE.Group();
    const rng = createRng(stage.seed + 5);
    const posts = [];
    const boulders = [];
    for (let i = 0; i < track.count; i++) {
        if (!track.rail[i] && i % POST_SPACING === 0) posts.push(transform(track, i * track.segment, ROAD.postOffset, 0, 1));
        if (rng() < 0.16) {
            const size = rng.range(0.3, 1.5);
            boulders.push(
                transform(
                    track,
                    i * track.segment + rng() * 4,
                    track.wallOffset[i] - size * 0.2,
                    0,
                    size,
                    rng() * 6,
                ),
            );
        }
    }
    group.add(
        instanced(new THREE.BoxGeometry(0.1, 1.05, 0.1).translate(0, 0.52, 0), materials.post, posts, false),
    );
    // A few shapes of broken rock, the boulders shared out among them.
    BOULDER.shapes.forEach((seed, k) => {
        const share = boulders.filter((_, i) => { return i % BOULDER.shapes.length === k; });
        group.add(instanced(boulderGeometry(seed), materials.boulder, share, true));
    });

    for (const prop of track.props) {
        if (prop.type === 'sign') group.add(buildSign(track, materials, prop));
        if (prop.type === 'station') group.add(buildStation(track, authored, prop));
        if (prop.type === 'dealership') group.add(buildDealership(track, materials, prop));
    }
    return group;
}

/** An irregular lump of rock (flat-faced, as broken granite is) from noise seeded by `seed`. */
function boulderGeometry(seed) {
    const noise = new Noise(seed);
    const geometry = new THREE.IcosahedronGeometry(BOULDER.radius, BOULDER.detail);
    const pos = geometry.attributes.position;
    const f = BOULDER.frequency / BOULDER.radius;
    for (let k = 0; k < pos.count; k++) {
        const [x, y, z] = [pos.getX(k), pos.getY(k), pos.getZ(k)];
        const bump = 1 + BOULDER.roughness * noise.fbm3(x * f, y * f, z * f, 3);
        pos.setXYZ(k, x * bump, y * bump * BOULDER.squat, z * bump);
    }
    geometry.computeVertexNormals();
    return geometry;
}

/** Matrix placing an object at road coordinates, facing back down the road (its x across the road,
 *  its z along it), scaled by `scale` (a number, or [across, up, along]). */
export function transform(track, s, u, h, scale, spin = 0) {
    const p = track.toWorld(s, u, h);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.heading + spin, 0));
    const size = Array.isArray(scale) ? scale : [scale, scale, scale];
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), rotation, new THREE.Vector3(...size));
}

export function instanced(geometry, material, matrices, castShadow) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
    matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
    });
    mesh.count = matrices.length;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
}

/** A group positioned at road coordinates: +x points away from the road, -z down the road. */
function anchored(track, s, u) {
    const group = new THREE.Group();
    const p = track.toWorld(s, u);
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = -p.heading;
    return group;
}

function box(w, h, d, color, x, y, z) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** A sign panel facing the driver, on its post. */
function signPanel(material, width, height, y) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    panel.position.y = y;
    panel.castShadow = true;
    return panel;
}

function buildSign(track, materials, prop) {
    const group = anchored(track, prop.s, prop.u);
    const tall = prop.kind === 'gasPole';
    const size = tall ? 2.6 : SIGN_SIZE;
    const top = tall ? 7 : 2.4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, top, 6), materials.steel);
    post.position.y = top / 2;
    group.add(post, signPanel(materials.sign(prop.kind, prop.label), size, size, top));
    if (prop.advisory) group.add(signPanel(materials.sign('advisory', prop.advisory), 0.6, 0.6, top - 0.85));
    return group;
}

/** The authored gas station, its forecourt towards the road. */
function buildStation(track, authored, prop) {
    const group = anchored(track, prop.s, prop.u);
    const station = authored.instance(SCENERY_MODELS.station.model);
    station.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
    });
    group.add(station);
    return group;
}

function buildDealership(track, materials, prop) {
    const group = anchored(track, prop.s, prop.u);
    const glass = new THREE.MeshStandardMaterial({
        color: '#7fa6c4',
        roughness: 0.08,
        metalness: 0.6,
        transparent: true,
        opacity: 0.55,
    });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 22), glass);
    hall.position.set(4, 3, 0);
    group.add(hall);
    group.add(box(14.6, 0.6, 22.6, '#1a1a1a', 4, 6.3, 0));
    const sign = signPanel(materials.sign('dealer'), 4, 4, 8.6);
    sign.position.x = -3.4;
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
    return group;
}
