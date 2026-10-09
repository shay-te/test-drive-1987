import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { handJoints } from '../../cockpit/handPose.js';
import { DRIVER } from '../../data/driver.js';

const UP = new THREE.Vector3(0, 1, 0);
const LIMB_SIDES = 10;

/** Draws the seated driver from a pose: limbs as tubes between the joints, rigged gloved hands posed
 *  joint by joint, shoes, torso and, seen from outside only, the head. */
export class Driver {
    /** `hands`: the rigged hand models ({ left, right }) to pose. */
    constructor(hands) {
        this.group = new THREE.Group();
        this.geometries = [
            new THREE.CylinderGeometry(1, 1, 1, LIMB_SIDES),
            new THREE.SphereGeometry(1, LIMB_SIDES * 2, LIMB_SIDES),
            new THREE.BoxGeometry(1, 1, 1),
        ];
        const [tube, ball, box] = this.geometries;
        this.materials = Object.fromEntries(Object.entries(DRIVER.colors).map(([name, color]) => {
            return [name, new THREE.MeshStandardMaterial({ color, roughness: DRIVER.roughness })];
        }));
        const part = (geometry, material) => {
            const mesh = new THREE.Mesh(geometry, this.materials[material]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
            return mesh;
        };
        const limb = (material) => {
            return { bone: part(tube, material), joint: part(ball, material) };
        };
        this.arms = [0, 1].map(() => {
            return { upper: limb('jacket'), fore: limb('jacket') };
        });
        this.hands = [hands.left, hands.right].map((model) => { return this._hand(model); });
        this.legs = [0, 1].map(() => {
            return { thigh: limb('trousers'), shin: limb('trousers'), foot: part(box, 'shoes') };
        });
        this.torso = part(box, 'jacket');
        this.neck = part(tube, 'skin');
        this.head = part(ball, 'skin');
        this.hair = part(ball, 'hair');
        this.basis = new THREE.Matrix4();
        this.axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        this.from = new THREE.Vector3();
        this.to = new THREE.Vector3();
    }

    /** Places every part for `pose` (from driverPose); the head shows only when seen from `outside`. */
    update(pose, outside) {
        const r = DRIVER.radius;
        pose.arms.forEach((arm, i) => {
            const parts = this.arms[i];
            this._limb(parts.upper, arm.shoulder, arm.elbow, r.upperArm);
            this._limb(parts.fore, arm.elbow, arm.wrist, r.forearm);
            for (const { name, position, x, y, z } of handJoints(arm.hand)) {
                const bone = this.hands[i][name];
                bone.position.set(position.x, position.y, position.z);
                bone.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.axes[0].copy(x), this.axes[1].copy(y), this.axes[2].copy(z)));
            }
        });
        pose.legs.forEach((leg, i) => {
            const parts = this.legs[i];
            this._limb(parts.thigh, leg.hip, leg.knee, r.thigh);
            this._limb(parts.shin, leg.knee, leg.ankle, r.shin);
            this._block(parts.foot, leg.ankle, leg.ball, DRIVER.foot, DRIVER.footShift);
        });
        const [left, right] = pose.arms;
        const shoulders = this.from.addVectors(left.shoulder, right.shoulder).multiplyScalar(0.5);
        const hips = this.to.addVectors(pose.legs[0].hip, pose.legs[1].hip).multiplyScalar(0.5);
        this._torso(hips, shoulders, left.shoulder, right.shoulder);
        const h = DRIVER.head;
        this.head.position.set(pose.eye.x, pose.eye.y + h.up, pose.eye.z + h.back);
        this.head.scale.set(...h.radii);
        this.hair.position.copy(this.head.position).add(this.to.set(0, DRIVER.hair.up, DRIVER.hair.back));
        this.hair.scale.copy(this.head.scale).multiplyScalar(DRIVER.hair.grow);
        this._stretch(this.neck, shoulders, this.head.position, r.neck);
        for (const part of [this.head, this.hair, this.neck]) part.visible = outside;
    }

    /** A copy of a rigged hand `model` in the gloves, added to the driver: its bones by joint name. */
    _hand(model) {
        const hand = clone(model);
        const bones = {};
        hand.traverse((node) => {
            if (node.isBone) bones[node.name] = node;
            if (node.isSkinnedMesh) {
                node.material = this.materials.gloves;
                node.castShadow = true;
                node.receiveShadow = true;
                // Posed far from where it was bound: its bind-pose bounds say nothing of where it is.
                node.frustumCulled = false;
            }
        });
        this.group.add(hand);
        return bones;
    }

    /** A bone from joint `a` to joint `b`, rounded off at `a`. */
    _limb({ bone, joint }, a, b, radius) {
        this._stretch(bone, a, b, radius);
        joint.position.copy(a);
        joint.scale.setScalar(radius);
    }

    /** A tube `mesh` (unit radius and length along y) laid from `a` to `b`. */
    _stretch(mesh, a, b, radius) {
        const along = this.axes[1].subVectors(b, a);
        const length = along.length();
        mesh.position.copy(a).addScaledVector(along, 0.5);
        mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(length));
        mesh.scale.set(radius, length, radius);
    }

    /** A box of `size` [across, high, long] laid along `a` to `b`, its centre `shift` of its length past `b`. */
    _block(mesh, a, b, size, shift) {
        const along = this.axes[2].subVectors(b, a).normalize();
        mesh.quaternion.setFromUnitVectors(this.axes[0].set(0, 0, 1), along);
        mesh.position.copy(b).addScaledVector(along, shift * size[2]);
        mesh.scale.set(...size);
    }

    /** The torso from the hips up to the shoulders, square to the line across them. */
    _torso(hips, shoulders, left, right) {
        const [across, up, back] = this.axes;
        up.subVectors(shoulders, hips);
        const height = up.length();
        up.divideScalar(height);
        across.subVectors(right, left);
        across.addScaledVector(up, -across.dot(up)).normalize();
        back.crossVectors(across, up);
        this.torso.quaternion.setFromRotationMatrix(this.basis.makeBasis(across, up, back));
        this.torso.position.addVectors(hips, shoulders).multiplyScalar(0.5).addScaledVector(up, DRIVER.shoulderRise / 2);
        this.torso.scale.set(DRIVER.torso[0], height + DRIVER.shoulderRise, DRIVER.torso[1]);
    }

    dispose() {
        for (const geometry of this.geometries) geometry.dispose();
        for (const material of Object.values(this.materials)) material.dispose();
    }
}
