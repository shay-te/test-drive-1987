import * as THREE from 'three';
import { WATER } from '../config.js';
import { fishSchool } from './fishSchool.js';

const UP = new THREE.Vector3(0, 1, 0);
const PARTICLE_DETAIL = 6;
const FISH_DETAIL = 8;

/** The sea from inside: its murk, fish circling a sunk car, and the splash and bubbles around it. */
export class Underwater {
    constructor(scene, seaLevel) {
        this.scene = scene;
        this.seaLevel = seaLevel;
        this.above = { color: scene.fog.color.clone(), density: scene.fog.density };
        const shape = WATER.fishShape;
        const fish = new THREE.MeshStandardMaterial({ color: WATER.colors.fish, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
        // A body of unit length facing -z, and a tail fin hinged at its back end.
        const body = new THREE.SphereGeometry(0.5, FISH_DETAIL, FISH_DETAIL / 2).scale(shape.width, shape.height, 1);
        const tail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
            0, 0, 0, 0, shape.height * 0.8, 0.3, 0, -shape.height * 0.8, 0.3,
        ], 3));
        tail.computeVertexNormals();
        this.bodies = this._instances(body, fish, WATER.fish.count);
        this.tails = this._instances(tail, fish, WATER.fish.count);
        const ball = new THREE.SphereGeometry(1, PARTICLE_DETAIL, PARTICLE_DETAIL / 2);
        this.drops = this._instances(ball, new THREE.MeshBasicMaterial({ color: WATER.colors.drop }), WATER.maxParticles);
        this.bubbles = this._instances(ball.clone(), new THREE.MeshStandardMaterial({
            color: WATER.colors.bubble, roughness: 0.1, transparent: true, opacity: 0.55,
        }), WATER.maxParticles);
        this.matrix = new THREE.Matrix4();
        this.hinge = new THREE.Matrix4();
        this.swing = new THREE.Matrix4();
        this.turn = new THREE.Quaternion();
        this.at = new THREE.Vector3();
        this.size = new THREE.Vector3();
    }

    _instances(geometry, material, count) {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
    }

    /** `underwater`: the camera is down with the car at `car` ({x, y, z}); `water` holds the drops and
     *  bubbles (WaterParticles), `time` the clock the fish swim by. */
    update({ underwater, car, water, time }) {
        const fog = this.scene.fog;
        if (underwater) {
            fog.color.set(WATER.fog.color);
            fog.density = WATER.fog.density;
        } else {
            fog.color.copy(this.above.color);
            fog.density = this.above.density;
        }
        const school = underwater ? fishSchool(car, time, this.seaLevel) : [];
        school.forEach((f, i) => {
            this.turn.setFromAxisAngle(UP, f.heading);
            this.matrix.compose(this.at.set(f.x, f.y, f.z), this.turn, this.size.setScalar(f.size));
            this.bodies.setMatrixAt(i, this.matrix);
            this.hinge.makeTranslation(0, 0, 0.5);
            this.swing.makeRotationY(f.tail * WATER.fishShape.tailSwing);
            this.tails.setMatrixAt(i, this.matrix.multiply(this.hinge).multiply(this.swing));
        });
        this._show(this.bodies, school.length);
        this._show(this.tails, school.length);
        this._particles(this.drops, water.drops);
        this._particles(this.bubbles, water.bubbles);
    }

    _particles(mesh, list) {
        const count = Math.min(list.length, WATER.maxParticles);
        for (let i = 0; i < count; i++) {
            const p = list[i];
            this.matrix.makeScale(p.size, p.size, p.size).setPosition(p.x, p.y, p.z);
            mesh.setMatrixAt(i, this.matrix);
        }
        this._show(mesh, count);
    }

    _show(mesh, count) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
    }
}
