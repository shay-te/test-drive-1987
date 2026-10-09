import * as THREE from 'three';
import { FOREST } from '../data/scenery.js';
import { TAU, createRng } from '../util/math.js';
import { coniferGeometry, silhouetteGeometry } from './conifer.js';

/** The forest: trees bunched in square chunks, each chunk drawn tree by tree near the car and as
 *  silhouettes further off; update() swaps them as the car moves. */
export class Forest {
    /** `placements`: [{ x, y, z, height }] where trees stand; `seed` varies their shapes and colours. */
    constructor(placements, materials, seed) {
        this.group = new THREE.Group();
        this.shapes = FOREST.shapes.map((shape) => { return coniferGeometry(shape); });
        this.silhouette = silhouetteGeometry();
        const rng = createRng(seed);
        const chunks = new Map();
        for (const p of placements) {
            const key = `${Math.floor(p.x / FOREST.chunk)},${Math.floor(p.z / FOREST.chunk)}`;
            if (!chunks.has(key)) chunks.set(key, []);
            chunks.get(key).push({
                ...p,
                shape: rng.int(0, this.shapes.length - 1),
                turn: rng() * TAU,
                girth: rng.range(0.85, 1.15),
                tint: 1 + (rng() * 2 - 1) * FOREST.variation,
            });
        }
        this.chunks = [...chunks.values()].map((trees) => { return this._chunk(trees, materials); });
    }

    _chunk(trees, materials) {
        const centre = trees.reduce((sum, p) => { return sum.add(new THREE.Vector3(p.x, 0, p.z)); }, new THREE.Vector3()).divideScalar(trees.length);
        const near = this.shapes.map((geometry, shape) => {
            return this._instances(geometry, [materials.bark, materials.needles], trees.filter((tree) => { return tree.shape === shape; }), true);
        });
        const far = this._instances(this.silhouette, materials.treeSilhouette, trees, false);
        this.group.add(...near, far);
        return { centre, near, far, close: null };
    }

    _instances(geometry, material, trees, castShadow) {
        const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, trees.length));
        const matrix = new THREE.Matrix4();
        const turn = new THREE.Quaternion();
        const color = new THREE.Color();
        trees.forEach((tree, i) => {
            turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, tree.turn);
            matrix.compose(new THREE.Vector3(tree.x, tree.y, tree.z), turn, new THREE.Vector3(tree.height * tree.girth, tree.height, tree.height * tree.girth));
            mesh.setMatrixAt(i, matrix);
            mesh.setColorAt(i, color.setScalar(tree.tint));
        });
        mesh.count = trees.length;
        mesh.computeBoundingSphere();
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        return mesh;
    }

    /** Draws the chunks within FOREST.near of `position` (the car) tree by tree, the rest as silhouettes. */
    update(position) {
        for (const chunk of this.chunks) {
            const close = Math.hypot(chunk.centre.x - position.x, chunk.centre.z - position.z) < FOREST.near;
            if (close === chunk.close) continue;
            chunk.close = close;
            for (const mesh of chunk.near) mesh.visible = close;
            chunk.far.visible = !close;
        }
    }
}
