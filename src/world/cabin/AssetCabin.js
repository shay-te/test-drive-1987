import * as THREE from 'three';
import { driverPose } from '../../cockpit/driverPose.js';
import { DRIVER } from '../../data/driver.js';
import { DEG, clamp } from '../../util/math.js';
import { CabinDisplays } from './CabinDisplays.js';
import { CabinWindshield } from './CabinWindshield.js';
import { Driver } from './Driver.js';
import { leverAngles, radarLights, wheelAngle } from './cabinAnimation.js';
import { CABIN } from './cabinLayout.js';
import { sideMirrorNodes, validateCabinNodes } from './cabinAsset.js';
import { onCabinLayer } from './cabinLayer.js';
import { disposePlates, licencePlates } from './licencePlate.js';

/** An authored cabin instance sharing cached geometry and owning its live display resources and driver. */
export class AssetCabin {
    /** `sideTextures` holds the door mirror pictures ({ left, right }) for the mirrors this cabin has,
     *  `hands` the driver's rigged hands ({ left, right } models). */
    constructor(car, resources, anisotropy, mirrorTexture, template, sideTextures, hands) {
        if (!template) throw new Error(`Cabin asset was not prepared for ${car.id}`);
        this.root = template.clone(true);
        const nodes = [];
        this.root.traverse((node) => { nodes.push(node); });
        this.bindings = validateCabinNodes(nodes);
        this.eye = this.bindings.driver_eye;
        this.mirrorMount = this.bindings.mirror_camera;
        this.materials = new Set();
        this.mirrorGeometries = [];
        this._displays(car, resources, anisotropy, mirrorTexture);
        this.sideMirrors = sideMirrorNodes(nodes);
        for (const [side, mirror] of Object.entries(this.sideMirrors)) this._mirror(mirror.surface, sideTextures[side]);
        this._seatDriver(hands);
        this.plates = onCabinLayer(licencePlates(car, resources));
        this.root.add(this.plates);
    }

    /** The driver, and where the cabin puts their hands: the rim (measured from the wheel's own
     *  geometry) and the top of the gear knob. */
    _seatDriver(hands) {
        const b = this.bindings;
        this.driver = new Driver(hands);
        this.root.add(onCabinLayer(this.driver.group));
        let rim = null;
        let knob = null;
        pivotPoints(b.steering_wheel, (point) => {
            if (!rim || Math.hypot(point.x, point.y) > Math.hypot(rim.x, rim.y)) rim = point.clone();
        });
        pivotPoints(b.gear_lever, (point) => { if (!knob || point.y > knob.y) knob = point.clone(); });
        this.rim = { radius: Math.hypot(rim.x, rim.y) - DRIVER.rimInset, z: rim.z };
        this.knobTop = knob;
        this.rig = {
            eye: this._inCar(b.driver_eye, new THREE.Vector3()),
            grips: [new THREE.Vector3(), new THREE.Vector3()],
            wheel: { hub: new THREE.Vector3(), axis: new THREE.Vector3(), up: new THREE.Vector3() },
            knob: new THREE.Vector3(),
        };
    }

    /** `point`, given in `node`'s frame, in the cabin's (car) frame. */
    _inCar(node, point) {
        for (let n = node; n !== this.root; n = n.parent) {
            n.updateMatrix();
            point.applyMatrix4(n.matrix);
        }
        return point;
    }

    _displays(car, resources, anisotropy, mirrorTexture) {
        const b = this.bindings;
        this.displays = new CabinDisplays(car, resources, anisotropy, false);
        b.instrument_surface.material = this.displays.clusterMaterial;
        b.trip_surface.material = this.displays.tripMaterial;
        const assign = (name, material) => {
            this.materials.add(material);
            b[name].material = material;
        };
        this._mirror(b.mirror_surface, mirrorTexture);
        assign('windshield_surface', new THREE.MeshStandardMaterial({
            ...CABIN.glass, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }));
        b.windshield_surface.renderOrder = 1;
        this.windshield = new CabinWindshield(b.windshield_surface.geometry, false);
        b.windshield_surface.add(this.windshield.mesh);
        this.leds = Array.from({ length: CABIN.radar.leds }, (_, i) => {
            const name = `radar_led_${i}`;
            assign(name, new THREE.MeshStandardMaterial({
                color: CABIN.radarLight.off, emissive: CABIN.radarLight.on, emissiveIntensity: 0,
            }));
            return b[name];
        });
        this.wheelNeutral = b.steering_wheel.quaternion.clone();
        this.leverNeutral = b.gear_lever.quaternion.clone();
        this.rotation = new THREE.Euler();
        this.delta = new THREE.Quaternion();
        this.root.traverse((node) => {
            if (node.isMesh && !node.material.transparent) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
        onCabinLayer(this.root);
    }

    /** Shows a mirror picture (a render target) on `surface`. */
    _mirror(surface, texture) {
        // Render-target UVs are bottom-up; glTF image UVs are top-down.
        const geometry = surface.geometry.clone();
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        surface.geometry = geometry;
        this.mirrorGeometries.push(geometry);
        surface.material = new THREE.MeshBasicMaterial({ map: texture });
        this.materials.add(surface.material);
    }

    /** `outside`: the cabin is seen from outside the car, so the driver's head shows. */
    update(cockpit, outside) {
        const b = this.bindings;
        this.displays.update(cockpit.state, cockpit.readings, cockpit.lamps, cockpit.trip);
        this.windshield.update(cockpit.cracks);
        this.rotation.set(0, 0, wheelAngle(cockpit.steer));
        b.steering_wheel.quaternion.copy(this.wheelNeutral).multiply(this.delta.setFromEuler(this.rotation));
        const angles = leverAngles(cockpit.state.knob);
        this.rotation.set(angles.x, 0, angles.z);
        b.gear_lever.quaternion.copy(this.leverNeutral).multiply(this.delta.setFromEuler(this.rotation));
        const turn = clamp(wheelAngle(cockpit.steer), -DRIVER.gripTurnDeg * DEG, DRIVER.gripTurnDeg * DEG);
        const mount = b.steering_wheel.parent;
        const { radius, z } = this.rim;
        this.rig.grips.forEach((grip, i) => {
            const angle = turn + (i === 0 ? Math.PI : 0);
            this._inCar(mount, grip.set(radius * Math.cos(angle), radius * Math.sin(angle), z));
        });
        // The rim the hands hold: its hub, the column towards the driver, and twelve o'clock as far as the
        // hands have turned it.
        const { hub, axis, up } = this.rig.wheel;
        this._inCar(mount, hub.set(0, 0, z));
        this._inCar(mount, axis.set(0, 0, z + 1)).sub(hub);
        this._inCar(mount, up.set(-Math.sin(turn), Math.cos(turn), z)).sub(hub).normalize();
        this._inCar(b.gear_lever, this.rig.knob.copy(this.knobTop));
        this.driver.update(driverPose(this.rig, cockpit.state.driver), outside);
        const lights = radarLights(cockpit.radar, cockpit.time, this.leds.length);
        this.leds.forEach((led, i) => {
            led.material.emissiveIntensity = lights[i] ? CABIN.radarLight.intensity : 0;
            led.material.color.set(lights[i] ? CABIN.radarLight.on : CABIN.radarLight.off);
        });
    }

    dispose() {
        for (const material of this.materials) material.dispose();
        for (const geometry of this.mirrorGeometries) geometry.dispose();
        this.displays.dispose();
        this.windshield.dispose();
        this.driver.dispose();
        disposePlates(this.plates);
        this.materials.clear();
    }
}

/** Visits every vertex of the meshes hung on `pivot`, in the pivot's own frame. */
function pivotPoints(pivot, visit) {
    pivot.updateWorldMatrix(true, true);
    const toPivot = pivot.matrixWorld.clone().invert();
    const toLocal = new THREE.Matrix4();
    const point = new THREE.Vector3();
    pivot.traverse((mesh) => {
        if (!mesh.isMesh) return;
        toLocal.multiplyMatrices(toPivot, mesh.matrixWorld);
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) visit(point.fromBufferAttribute(position, i).applyMatrix4(toLocal));
    });
}
