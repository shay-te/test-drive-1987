import * as THREE from 'three';
import { CABIN } from './cabinLayout.js';
import { part } from './shapes.js';

/** The gear lever on the tunnel: boot or chrome gate, lever and knob, tilted to the knob's gate position. */
export class CabinShifter {
    constructor(car, materials) {
        const s = CABIN.shifter;
        const gate = car.cockpit.shifter.type === 'gate';
        this.group = new THREE.Group();
        this.group.position.set(s.x, s.y, s.z);
        const base = gate
            ? part(new THREE.BoxGeometry(0.12, 0.012, 0.11), materials.chrome)
            : part(new THREE.ConeGeometry(0.065, 0.1, 24, 1, true), materials.rubber);
        base.position.y = gate ? 0 : 0.04;
        this.group.add(base);
        this.pivot = new THREE.Group();
        this.group.add(this.pivot);
        const lever = part(new THREE.CylinderGeometry(0.0065, 0.008, s.length, 12), materials.chrome);
        lever.position.y = s.length / 2;
        const knob = part(new THREE.SphereGeometry(s.knob, 24, 16), materials.knob);
        knob.position.y = s.length;
        this.pivot.add(lever, knob);
    }

    /** Tilts the lever so its knob sits at gate position `knob` = [column, row]. */
    update(knob) {
        const s = CABIN.shifter;
        this.pivot.rotation.z = -Math.atan2(knob[0] * s.col, s.length);
        this.pivot.rotation.x = Math.atan2(knob[1] * s.row, s.length);
    }
}
