import * as THREE from 'three';
import { ROAD } from '../config.js';
import { createRng } from '../util/math.js';

const POST_SPACING = 6;
const SIGN_SIZE = 0.95;
const STATION_COLORS = {
    wall: '#e9e4d8',
    trim: '#c8201b',
    roof: '#3a3a3e',
    pump: '#d8d4cc',
    glass: '#1d2a33',
};

/** Roadside objects: posts, rail posts, boulders, signs, the gas station and the summit dealership. */
export function buildProps(track, materials, stage) {
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
        if (prop.type === 'station') group.add(buildStation(track, materials, prop));
        if (prop.type === 'dealership') group.add(buildDealership(track, materials, prop));
    }
    return group;
}

/** Instanced pine trees at precomputed world positions [{x, y, z, height}]. */
export function buildTrees(placements, materials) {
    const foliage = [];
    const trunks = [];
    const m = new THREE.Matrix4();
    for (const p of placements) {
        foliage.push(
            m
                .clone()
                .compose(
                    new THREE.Vector3(p.x, p.y + p.height * 0.18, p.z),
                    new THREE.Quaternion(),
                    new THREE.Vector3(p.height * 0.3, p.height, p.height * 0.3),
                ),
        );
        trunks.push(
            m
                .clone()
                .compose(
                    new THREE.Vector3(p.x, p.y, p.z),
                    new THREE.Quaternion(),
                    new THREE.Vector3(0.25, p.height * 0.25, 0.25),
                ),
        );
    }
    const group = new THREE.Group();
    group.add(
        instanced(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), materials.foliage, foliage, true),
    );
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

function buildStation(track, materials, prop) {
    const group = anchored(track, prop.s, prop.u);
    const c = STATION_COLORS;
    group.add(box(10, 4.6, 16, c.wall, 6, 2.3, 0));
    group.add(box(10.4, 0.5, 16.4, c.roof, 6, 4.85, 0));
    group.add(box(0.1, 1.6, 12, c.glass, 0.96, 1.6, 0));
    group.add(box(9, 0.6, 14, c.trim, -8, 5.3, 0));
    for (const [x, z] of [
        [-11.8, -6],
        [-11.8, 6],
        [-4.2, -6],
        [-4.2, 6],
    ]) {
        group.add(box(0.35, 5, 0.35, c.pump, x, 2.5, z));
    }
    for (const z of [-4, 0, 4]) {
        group.add(box(0.8, 1.6, 0.5, c.trim, -8, 0.8, z));
        group.add(box(0.82, 0.5, 0.52, c.pump, -8, 1.35, z));
    }
    const fascia = signPanel(materials.sign('gasPole'), 2.4, 2.4, 5.3);
    fascia.position.x = -12.6;
    fascia.rotation.y = -Math.PI / 2;
    group.add(fascia);
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
