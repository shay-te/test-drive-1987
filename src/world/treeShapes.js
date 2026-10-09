import * as THREE from 'three';
import { TAU, createRng, smoothstep } from '../util/math.js';

/** A trunk's radius at its foot, per metre of the tree's height, and how far up it thins to its tip. */
const TRUNK_RADIUS = 0.016;
const TRUNK_TOP = 0.2;
const TRUNK_SIDES = 7;
const TRUNK_ROWS = 6;
/** The flared foot of a trunk rises this share of the tree's height. */
const FLARE_RISE = 0.05;
/** The leader bends over above this share of the height. */
const LEADER_FROM = 0.85;
/** Each branch spray is a card rolled this far (rad) from flat, alternately either way round the
 *  whorl, bent once along its length where the branch turns back up. */
const CARD_ROLL = Math.PI / 4;
const BEND_AT = 0.55;
/** Foliage normals lean out of the crown and this much upwards, so it shades as one mass. */
const NORMAL_LIFT = 0.45;
/** Broadleaf limbs: how thick at the trunk (per metre of height); leaf clusters sit this far out
 *  through the crown (share of its radius), each this share of the crown's width. */
const LIMB_RADIUS = 0.006;
const SHELL = [0.55, 1];
const CLUSTER = 0.2;
/** How far a leaf cluster's facing strays from straight out of the crown. */
const CLUSTER_TILT = 0.8;
const SILHOUETTE_CARDS = 3;

/** One tree of `species` (src/data/forest.js) of unit height standing on its origin, its shape from
 *  `seed`: the trunk (and limbs) as geometry group 0, the foliage as group 1 (cards of its spray or
 *  leaf-cluster picture, u along, v across). */
export function treeGeometry(species, seed) {
    const parts = { positions: [], normals: [], uvs: [] };
    const rng = createRng(seed);
    const lean = (up) => { return species.leader ? species.leader * smoothstep(LEADER_FROM, 1, up) ** 2 * (1 - LEADER_FROM) : 0; };
    addTrunk(parts, species, lean);
    const bark = parts.positions.length / 3;
    if (species.kind === 'conifer') addSprays(parts, species, rng, lean);
    else addLeaves(parts, species, rng);
    const geometry = cardGeometry(parts);
    geometry.addGroup(0, bark, 0);
    geometry.addGroup(bark, parts.positions.length / 3 - bark, 1);
    return geometry;
}

/** A tree's far-off stand-in of unit height: three upright cards crossed at its axis, each showing
 *  the whole tree (u across, v up), `width` of its height wide. */
export function silhouetteGeometry(width) {
    const parts = { positions: [], normals: [], uvs: [] };
    for (let c = 0; c < SILHOUETTE_CARDS; c++) {
        const angle = (c * Math.PI) / SILHOUETTE_CARDS;
        const across = [Math.cos(angle), Math.sin(angle)];
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
            const side = (u - 0.5) * width;
            parts.positions.push(across[0] * side, v, across[1] * side);
            const normal = new THREE.Vector3(across[0] * (u - 0.5), NORMAL_LIFT, across[1] * (u - 0.5)).normalize();
            parts.normals.push(normal.x, normal.y, normal.z);
            parts.uvs.push(u, v);
        }
    }
    return cardGeometry(parts);
}

/** The trunk: tapering to its tip (or into the crown, for a broadleaf tree), flared at the foot,
 *  bent over at the top by `lean`. */
function addTrunk(parts, species, lean) {
    const top = species.kind === 'conifer' ? 1 : species.crownBase + species.crown[1] / 2;
    const trunk = new THREE.CylinderGeometry(1, 1, 1, TRUNK_SIDES, TRUNK_ROWS, true).translate(0, 0.5, 0).toNonIndexed();
    const pos = trunk.attributes.position;
    for (let k = 0; k < pos.count; k++) {
        const up = pos.getY(k) * top;
        const flare = 1 + species.flare * (1 - smoothstep(0, FLARE_RISE, up));
        const radius = TRUNK_RADIUS * (1 - (1 - TRUNK_TOP) * (up / top)) * flare;
        pos.setXYZ(k, pos.getX(k) * radius + lean(up), up, pos.getZ(k) * radius);
    }
    trunk.computeVertexNormals();
    parts.positions.push(...pos.array);
    parts.normals.push(...trunk.attributes.normal.array);
    parts.uvs.push(...trunk.attributes.uv.array);
    trunk.dispose();
}

/** A conifer's crown: whorls of branch sprays drooping from the trunk and turning back up. */
function addSprays(parts, species, rng, lean) {
    for (let w = 0; w < species.whorls; w++) {
        const up = species.crownBase + (1 - species.crownBase) * ((w + 0.5 + (rng() - 0.5) * 0.4) / species.whorls);
        const reach = species.spread * ((1 - up) / (1 - species.crownBase)) ** species.taper * rng.range(0.8, 1.2) + 0.01;
        const centre = new THREE.Vector3(lean(up), up, 0);
        const twist = rng() * TAU;
        for (let b = 0; b < species.branches; b++) {
            const azimuth = twist + ((b + (rng() - 0.5) * 0.5) * TAU) / species.branches;
            const droop = species.droop * rng.range(0.6, 1.3) * (0.5 + 0.5 * (1 - up));
            const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
            const along = (angle) => { return out.clone().multiplyScalar(Math.cos(angle)).setY(-Math.sin(angle)); };
            const path = [centre, centre.clone().addScaledVector(along(droop), reach * BEND_AT)];
            path.push(path[1].clone().addScaledVector(along(droop - species.upturn), reach * (1 - BEND_AT)));
            const flat = new THREE.Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
            // Neighbouring sprays roll opposite ways, so the crown shows foliage from every side.
            const roll = b % 2 === 0 ? CARD_ROLL : -CARD_ROLL;
            bentCard(parts, path, flat.applyAxisAngle(along(droop), roll).multiplyScalar(reach * species.spray), centre);
        }
    }
}

/** A broadleaf crown: main limbs from the top of the trunk, leaf clusters over the crown's shell. */
function addLeaves(parts, species, rng) {
    const [width, height] = species.crown;
    const centre = new THREE.Vector3(0, species.crownBase + height / 2, 0);
    for (let l = 0; l < species.limbs; l++) {
        const azimuth = (l / species.limbs) * TAU + rng() * 0.6;
        const tip = new THREE.Vector3(Math.cos(azimuth) * width * 0.7, centre.y + height * rng.range(0, 0.35), Math.sin(azimuth) * width * 0.7);
        limb(parts, new THREE.Vector3(0, species.crownBase + height * 0.15, 0), tip, LIMB_RADIUS);
    }
    for (let c = 0; c < species.clusters; c++) {
        const out = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
        const at = centre.clone().add(new THREE.Vector3(out.x * width, (out.y * height) / 2, out.z * width).multiplyScalar(rng.range(...SHELL)));
        const size = width * 2 * CLUSTER * rng.range(0.8, 1.2);
        // Each cluster faces out of the crown (tilted a little at random), so none shows only its edge.
        const facing = out.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(CLUSTER_TILT)).normalize();
        const along = new THREE.Vector3(0, 1, 0).cross(facing);
        if (along.lengthSq() < 1e-6) along.set(1, 0, 0);
        along.normalize().applyAxisAngle(facing, rng() * TAU);
        const across = facing.clone().cross(along);
        const path = [at.clone().addScaledVector(along, -size / 2), at, at.clone().addScaledVector(along, size / 2)];
        bentCard(parts, path, across.multiplyScalar(size * species.spray), centre);
    }
}

/** A card along `path` (three points), `side` wide across, its normals leaning out from `centre`. */
function bentCard(parts, path, side, centre) {
    const row = (k) => {
        return [path[k].clone().addScaledVector(side, -0.5), path[k].clone().addScaledVector(side, 0.5)];
    };
    const normal = (p) => {
        const n = p.clone().sub(centre).setY(0).normalize();
        n.y += NORMAL_LIFT;
        return n.normalize();
    };
    for (let k = 0; k < path.length - 1; k++) {
        const [a, b] = row(k);
        const [c, d] = row(k + 1);
        const [u0, u1] = [k / (path.length - 1), (k + 1) / (path.length - 1)];
        for (const [p, u, v] of [[a, u0, 0], [c, u1, 0], [d, u1, 1], [a, u0, 0], [d, u1, 1], [b, u0, 1]]) {
            parts.positions.push(p.x, p.y, p.z);
            const n = normal(p);
            parts.normals.push(n.x, n.y, n.z);
            parts.uvs.push(u, v);
        }
    }
}

/** A thin limb from `a` to `b`, `radius` thick at `a` and tapering. */
function limb(parts, a, b, radius) {
    const along = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius * 0.3, radius, along.length(), 4, 1, true).toNonIndexed();
    geometry.translate(0, along.length() / 2, 0);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, along.normalize()));
    geometry.translate(a.x, a.y, a.z);
    parts.positions.push(...geometry.attributes.position.array);
    parts.normals.push(...geometry.attributes.normal.array);
    parts.uvs.push(...geometry.attributes.uv.array);
    geometry.dispose();
}

/** Unindexed geometry from flat lists of positions, normals and uvs. */
function cardGeometry({ positions, normals, uvs }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
}
