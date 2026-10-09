import * as THREE from 'three';
import { FOREST } from '../data/forest.js';
import { TAU, createRng, smoothstep } from '../util/math.js';

/** How far up a trunk thins to its tip (its foot is FOREST.trunkRadius per metre of height). */
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
/** Broadleaf limbs: how thick at the trunk (per metre of height), a branch's share of that; branches
 *  end this far out through the crown (share of its radius) and carry their sprays along this outer
 *  share of their length. */
const LIMB_RADIUS = 0.006;
const BRANCH_RADIUS = 0.4;
const SHELL = [0.7, 1.05];
const SPRAYS_ALONG = [0.35, 1];
/** How far a spray strays from straight out of the crown, and how much it reaches up (it droops at the
 *  tip by the species' `droop`). */
const SPRAY_SCATTER = 0.9;
const SPRAY_RISE = 0.35;
const SILHOUETTE_CARDS = 3;

/** One tree of `species` (src/data/forest.js) of unit height standing on its origin, its shape from
 *  `seed`: the trunk (and limbs) as geometry group 0, the foliage as group 1 (cards of its spray or
 *  leaf-cluster picture, u along, v across). */
export function treeGeometry(species, seed) {
    const parts = { positions: [], normals: [], uvs: [] };
    const rng = createRng(seed);
    const lean = (up) => { return species.leader ? species.leader * smoothstep(LEADER_FROM, 1, up) ** 2 * (1 - LEADER_FROM) : 0; };
    if (species.kind === 'conifer' || species.kind === 'broadleaf') addTrunk(parts, species, lean);
    const bark = parts.positions.length / 3;
    if (species.kind === 'conifer') addSprays(parts, species, rng, lean);
    else if (species.kind === 'fern') patch(species, rng, (at, size) => { addFronds(parts, species, rng, at, size); });
    else if (species.kind === 'shrub') patch(species, rng, (at, size) => { addLeaves(parts, species, rng, at, size); });
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
        const radius = FOREST.trunkRadius * (1 - (1 - TRUNK_TOP) * (up / top)) * flare;
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

/** A patch of the forest floor: `species.clumps` plants of it within `species.patch` (share of its
 *  height) of the patch's centre, each grown by `grow(at, size)` at its own size. */
function patch(species, rng, grow) {
    for (let c = 0; c < species.clumps; c++) {
        const [angle, out] = [rng() * TAU, c === 0 ? 0 : species.patch * Math.sqrt(rng())];
        grow(new THREE.Vector3(Math.cos(angle) * out, 0, Math.sin(angle) * out), rng.range(0.65, 1.1));
    }
}

/** A fern clump at `at`, `size` times the unit plant: its fronds rising from the crown at the ground
 *  in a ring, each arching over and drooping to its tip. */
function addFronds(parts, species, rng, at, size) {
    const base = at.clone();
    const centre = at.clone().setY(0.4 * size);
    for (let f = 0; f < species.fronds; f++) {
        const azimuth = ((f + rng.range(-0.3, 0.3)) / species.fronds) * TAU;
        const rise = rng.range(...species.rise);
        const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
        const along = (angle) => { return out.clone().multiplyScalar(Math.cos(angle)).setY(Math.sin(angle)); };
        const length = rng.range(0.8, 1.2) * size;
        const path = [base, base.clone().addScaledVector(along(rise), length * BEND_AT)];
        path.push(path[1].clone().addScaledVector(along(rise - species.droop), length * (1 - BEND_AT)));
        const flat = new THREE.Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
        bentCard(parts, path, flat.applyAxisAngle(along(rise), rng.range(-0.4, 0.4)).multiplyScalar(length * species.spray), centre);
    }
}

/** A broadleaf crown (or a shrub at `at`, `size` times the unit plant): main limbs forking up and out
 *  from the trunk, branches from them out to an uneven shell, and leafy sprays along each branch's
 *  outer part, reaching out of the crown and drooping at the tips, rolled every way so the crown shows
 *  leaves from every side. */
function addLeaves(parts, species, rng, at = new THREE.Vector3(), size = 1) {
    const [width, height] = species.crown.map((d) => { return d * size; });
    const fork = at.clone().setY(species.crownBase * size);
    const centre = at.clone().setY((species.crownBase + species.crown[1] / 2) * size);
    const shell = (direction, reach) => {
        return centre.clone().add(new THREE.Vector3(direction.x * width, (direction.y * height) / 2, direction.z * width).multiplyScalar(reach));
    };
    const scatter = (v, amount) => {
        return v.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(amount)).normalize();
    };
    for (let l = 0; l < species.limbs; l++) {
        const azimuth = ((l + rng.range(-0.3, 0.3)) / species.limbs) * TAU;
        const up = rng.range(0.1, 0.6);
        const tip = shell(new THREE.Vector3(Math.cos(azimuth), up, Math.sin(azimuth)).normalize(), rng.range(0.55, 0.75));
        limb(parts, fork, tip, LIMB_RADIUS * size);
        for (let b = 0; b < species.branches; b++) {
            const from = fork.clone().lerp(tip, rng.range(0.3, 1));
            const out = scatter(from.clone().sub(centre).add(new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth))), 1.2);
            const to = shell(out, rng.range(...SHELL));
            limb(parts, from, to, LIMB_RADIUS * BRANCH_RADIUS * size);
            for (let k = 0; k < species.sprays; k++) {
                const at = from.clone().lerp(to, rng.range(...SPRAYS_ALONG));
                const reach = width * species.reach * rng.range(0.75, 1.25);
                const heading = scatter(at.clone().sub(centre).setY(0).normalize().setY(SPRAY_RISE), SPRAY_SCATTER);
                const droop = (angle) => {
                    return heading.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0).cross(heading).normalize(), -angle);
                };
                const path = [at, at.clone().addScaledVector(heading, reach * BEND_AT)];
                path.push(path[1].clone().addScaledVector(droop(species.droop), reach * (1 - BEND_AT)));
                const flat = new THREE.Vector3(0, 1, 0).cross(heading).normalize();
                const side = flat.applyAxisAngle(heading, rng.range(-1, 1) * CARD_ROLL * 1.6);
                bentCard(parts, path, side.multiplyScalar(reach * species.spray), centre);
            }
        }
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
