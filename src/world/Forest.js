import * as THREE from 'three';
import { FOREST, SPECIES } from '../data/forest.js';
import { TAU, createRng } from '../util/math.js';
import { silhouetteGeometry, treeGeometry } from './treeShapes.js';

const NAMES = Object.keys(SPECIES);
/** A silhouette card's width, per metre of the tree's height, by kind of tree. */
const SILHOUETTE_WIDTH = { conifer: 0.3, broadleaf: 0.62 };

/** The forest: one instanced mesh a species for the trees near the car, drawn branch by branch, and
 *  one a kind of tree for the silhouettes of all the others; update() gathers the near trees again
 *  as the car moves on. */
export class Forest {
    /** `placements`: [{ x, y, z, height, species }]; `seed` varies their shapes and colours. */
    constructor(placements, materials, seed) {
        this.group = new THREE.Group();
        const rng = createRng(seed);
        const turn = new THREE.Quaternion();
        this.trees = placements.map((p) => {
            const species = SPECIES[p.species];
            const girth = rng.range(0.85, 1.15);
            turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * TAU);
            const matrix = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), turn, new THREE.Vector3(p.height * girth, p.height, p.height * girth));
            const tint = 1 + (rng() * 2 - 1) * FOREST.variation;
            return { x: p.x, z: p.z, index: NAMES.indexOf(p.species), kind: species.kind, matrix, tint, far: new THREE.Color(species.foliage[1]).multiplyScalar(tint) };
        });
        const count = (test) => { return Math.max(1, this.trees.filter(test).length); };
        this.near = NAMES.map((name, k) => {
            const material = [materials.trees[name].bark, materials.trees[name].foliage];
            return this._mesh(treeGeometry(SPECIES[name], seed + k), material, count((tree) => { return tree.index === k; }), true);
        });
        this.far = Object.fromEntries(Object.entries(SILHOUETTE_WIDTH).map(([kind, width]) => {
            return [kind, this._mesh(silhouetteGeometry(width), materials.silhouettes[kind], count((tree) => { return tree.kind === kind; }), false)];
        }));
        this.cells = new Map();
        this.trees.forEach((tree, i) => {
            const key = this._key(tree.x, tree.z);
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(i);
        });
        this.cell = null;
    }

    _key(x, z) {
        return `${Math.floor(x / FOREST.cell)},${Math.floor(z / FOREST.cell)}`;
    }

    _mesh(geometry, material, capacity, castShadow) {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.count = 0;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        // Instances come and go as the car moves: the meshes span the whole stage.
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return mesh;
    }

    /** Draws the trees within FOREST.near of `position` (the car) branch by branch, the rest as
     *  silhouettes; only does the work when the car has moved into another cell. */
    update(position) {
        const key = this._key(position.x, position.z);
        if (key === this.cell) return;
        this.cell = key;
        const near = new Set();
        const reach = Math.ceil(FOREST.near / FOREST.cell);
        const [cx, cz] = [Math.floor(position.x / FOREST.cell), Math.floor(position.z / FOREST.cell)];
        for (let dx = -reach; dx <= reach; dx++) {
            for (let dz = -reach; dz <= reach; dz++) {
                for (const i of this.cells.get(`${cx + dx},${cz + dz}`) ?? []) {
                    const tree = this.trees[i];
                    if (Math.hypot(tree.x - position.x, tree.z - position.z) < FOREST.near) near.add(i);
                }
            }
        }
        for (const mesh of [...this.near, ...Object.values(this.far)]) mesh.count = 0;
        const color = new THREE.Color();
        this.trees.forEach((tree, i) => {
            const mesh = near.has(i) ? this.near[tree.index] : this.far[tree.kind];
            mesh.setMatrixAt(mesh.count, tree.matrix);
            mesh.setColorAt(mesh.count, near.has(i) ? color.setScalar(tree.tint) : tree.far);
            mesh.count++;
        });
        for (const mesh of [...this.near, ...Object.values(this.far)]) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
        }
    }
}
