import * as THREE from 'three';
import { ROAD } from '../config.js';
import { SCENERY_MODELS } from '../data/scenery.js';
import { createRng } from '../util/math.js';

const POST_SPACING = 6;
const SIGN_SIZE = 0.95;

/** Roadside objects: posts, rail posts, boulders, signs, the gas station and the summit dealership. */
export function buildProps(track, materials, stage, authored) {
    const group = new THREE.Group();
    const rng = createRng(stage.seed + 5);
    const posts = [];
    const railPosts = [];
    const boulders = [];
    for (let i = 0; i < track.count; i++) {
        if (track.rail[i]) railPosts.push(transform(track, i * track.segment, ROAD.postOffset - 0.08, 0, 1));
        else if (i % POST_SPACING === 0)
            posts.push(transform(track, i * track.segment, ROAD.postOffset, 0, 1));
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
    group.add(
        instanced(
            new THREE.BoxGeometry(0.15, 0.85, 0.12).translate(0, 0.42, 0),
            materials.steel,
            railPosts,
            true,
        ),
    );
    group.add(instanced(new THREE.IcosahedronGeometry(0.6, 0), materials.boulder, boulders, true));

    for (const prop of track.props) {
        if (prop.type === 'sign') group.add(buildSign(track, materials, prop));
        if (prop.type === 'station') group.add(buildStation(track, authored, prop));
        if (prop.type === 'dealership') group.add(buildDealership(track, materials, prop));
    }
    return group;
}

/** Instanced pines at world positions [{x, y, z, height}]: trunk plus two foliage tiers. */
export function buildTrees(placements, materials) {
    const tiers = [[], []];
    const trunks = [];
    const at = (p, lift, width, height) => {
        return new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y + lift, p.z),
            new THREE.Quaternion(),
            new THREE.Vector3(width, height, width),
        );
    };
    for (const p of placements) {
        tiers[0].push(at(p, p.height * 0.15, p.height * 0.3, p.height * 0.6));
        tiers[1].push(at(p, p.height * 0.45, p.height * 0.2, p.height * 0.55));
        trunks.push(at(p, 0, 0.22, p.height * 0.3));
    }
    const cone = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
    const group = new THREE.Group();
    for (const tier of tiers) group.add(instanced(cone, materials.foliage, tier, true));
    group.add(
        instanced(new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0), materials.bark, trunks, false),
    );
    return group;
}

/** Matrix placing an object at road coordinates, facing back down the road. */
function transform(track, s, u, h, scale, spin = 0) {
    const p = track.toWorld(s, u, h);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.heading + spin, 0));
    return new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        rotation,
        new THREE.Vector3(scale, scale, scale),
    );
}

function instanced(geometry, material, matrices, castShadow) {
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
