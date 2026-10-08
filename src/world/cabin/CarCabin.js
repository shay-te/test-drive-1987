import * as THREE from 'three';
import { ROAD } from '../../config.js';
import { CabinMaterials } from './CabinMaterials.js';
import { CabinShell } from './CabinShell.js';
import { CabinShifter } from './CabinShifter.js';
import { CabinWheel } from './CabinWheel.js';
import { CABIN } from './cabinLayout.js';
import { Dashboard } from './Dashboard.js';
import { onCabinLayer } from './shapes.js';

/** One car's interior in 3D, built in car space and carried along the road at the car's pose.
 *  `eye` is where the driver's head sits; `mirrorMount` is where the rear-view camera looks back from. */
export class CarCabin {
    constructor(car, resources, anisotropy, mirrorTexture) {
        const materials = new CabinMaterials(car, resources, anisotropy);
        this.root = new THREE.Group();
        this.shell = new CabinShell(materials, mirrorTexture);
        this.dashboard = new Dashboard(car, materials, resources);
        this.wheel = new CabinWheel(car, materials);
        this.shifter = new CabinShifter(car, materials);
        this.root.add(this.shell.group, this.dashboard.group, this.wheel.group, this.shifter.group);
        onCabinLayer(this.root);
        this.eye = new THREE.Group();
        this.eye.position.set(ROAD.eyeOffset, ROAD.eyeHeight, 0);
        this.mirrorMount = new THREE.Group();
        this.mirrorMount.position.set(CABIN.mirror.x, CABIN.mirror.y, CABIN.mirror.z);
        this.mirrorMount.rotation.y = Math.PI;
        this.root.add(this.eye, this.mirrorMount);
    }

    /** `cockpit` = {state, readings, lamps, trip, steer, radar, crack, time}: needles, LCDs, wheel,
     *  lever, LEDs and the windshield. */
    update(cockpit) {
        this.shell.setCrack(cockpit.crack);
        this.dashboard.update(cockpit.state, cockpit.readings, cockpit.lamps, cockpit.trip);
        this.wheel.update(cockpit.steer);
        this.shifter.update(cockpit.state.knob);
        this.shell.radar.update(cockpit.radar, cockpit.time);
    }

    dispose() {
        this.dashboard.displays.dispose();
        this.shell.crack.dispose();
        this.root.traverse((object) => {
            object.geometry?.dispose();
        });
    }
}
