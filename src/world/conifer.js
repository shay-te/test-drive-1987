import * as THREE from 'three';
import { FOREST } from '../data/scenery.js';
import { TAU, createRng } from '../util/math.js';

/** Crossed cards per branch spray, each rolled this far (rad) either side of flat. */
const CARD_ROLL = Math.PI / 4;
/** Normals lean out of the crown and this much upwards, so it shades as a whole. */
const NORMAL_LIFT = 0.45;
const TRUNK_SIDES = 6;
const SILHOUETTE_CARDS = 3;

/** A conifer of unit height standing on its origin, its shape from `seed`: a tapered trunk (geometry
 *  group 0) and a crown of branch sprays in whorls (group 1), each spray two crossed cards of the
 *  needle texture (u from trunk to tip). */
export function coniferGeometry(seed) {
    const t = FOREST.tree;
    const rng = createRng(seed);
    const trunk = new THREE.CylinderGeometry(t.trunk[0], t.trunk[1], 1, TRUNK_SIDES, 1, true).translate(0, 0.5, 0).toNonIndexed();
    const positions = [...trunk.attributes.position.array];
    const normals = [...trunk.attributes.normal.array];
    const uvs = [...trunk.attributes.uv.array];
    const trunkVertices = trunk.attributes.position.count;
    trunk.dispose();
    const corner = new THREE.Vector3();
    const card = (root, along, across, reach, centre) => {
        const ends = [[0, -0.5], [1, -0.5], [1, 0.5], [0, -0.5], [1, 0.5], [0, 0.5]];
        for (const [u, v] of ends) {
            corner.copy(root).addScaledVector(along, u * reach).addScaledVector(across, v * reach * t.width);
            positions.push(corner.x, corner.y, corner.z);
            const normal = corner.clone().sub(centre).setY(0).normalize();
            normal.y += NORMAL_LIFT;
            normal.normalize();
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(u, v + 0.5);
        }
    };
    for (let w = 0; w < t.whorls; w++) {
        const up = (w + 0.5 + (rng() - 0.5) * 0.4) / t.whorls;
        const height = t.crownBase + (1 - t.crownBase) * up;
        const reach = t.spread * (1 - up) ** t.taper * rng.range(0.8, 1.2);
        const twist = rng() * TAU;
        const centre = new THREE.Vector3(0, height, 0);
        for (let b = 0; b < t.branches; b++) {
            const azimuth = twist + ((b + (rng() - 0.5) * 0.5) * TAU) / t.branches;
            const droop = t.droop * rng.range(0.5, 1.5) * (0.4 + 0.6 * (1 - up));
            const along = new THREE.Vector3(Math.cos(azimuth) * Math.cos(droop), -Math.sin(droop), Math.sin(azimuth) * Math.cos(droop));
            const flat = new THREE.Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
            for (const roll of [-CARD_ROLL, CARD_ROLL]) card(centre, along, flat.clone().applyAxisAngle(along, roll), reach, centre);
        }
    }
    const geometry = cardGeometry(positions, normals, uvs);
    geometry.addGroup(0, trunkVertices, 0);
    geometry.addGroup(trunkVertices, positions.length / 3 - trunkVertices, 1);
    return geometry;
}

/** A far-off conifer of unit height: three upright cards crossed at its axis, each showing the whole
 *  tree's silhouette (u across, v up), their normals leaning out like the crown's. */
export function silhouetteGeometry() {
    const positions = [];
    const normals = [];
    const uvs = [];
    const half = FOREST.tree.spread;
    for (let c = 0; c < SILHOUETTE_CARDS; c++) {
        const angle = (c * Math.PI) / SILHOUETTE_CARDS;
        const across = [Math.cos(angle), Math.sin(angle)];
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
            const side = (u - 0.5) * 2 * half;
            positions.push(across[0] * side, v, across[1] * side);
            const normal = new THREE.Vector3(across[0] * (u - 0.5), NORMAL_LIFT, across[1] * (u - 0.5)).normalize();
            normals.push(normal.x, normal.y, normal.z);
            uvs.push(u, v);
        }
    }
    return cardGeometry(positions, normals, uvs);
}

/** Unindexed geometry from flat lists of positions, normals and uvs. */
function cardGeometry(positions, normals, uvs) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
}
