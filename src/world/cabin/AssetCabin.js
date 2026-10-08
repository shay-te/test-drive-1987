import * as THREE from 'three';
import { CabinDisplays } from './CabinDisplays.js';
import { CabinWindshield } from './CabinWindshield.js';
import { leverAngles, radarLights, wheelAngle } from './cabinAnimation.js';
import { CABIN } from './cabinLayout.js';
import { sideMirrorNodes, validateCabinNodes } from './cabinAsset.js';
import { onCabinLayer } from './cabinLayer.js';

/** An authored cabin instance sharing cached geometry and owning its live display resources. */
export class AssetCabin {
    /** `sideTextures` holds the door mirror pictures ({ left, right }) for the mirrors this cabin has. */
    constructor(car, resources, anisotropy, mirrorTexture, template, sideTextures) {
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

    update(cockpit) {
        this.displays.update(cockpit.state, cockpit.readings, cockpit.lamps, cockpit.trip);
        this.windshield.update(cockpit.cracks);
        this.rotation.set(0, 0, wheelAngle(cockpit.steer));
        this.bindings.steering_wheel.quaternion.copy(this.wheelNeutral).multiply(this.delta.setFromEuler(this.rotation));
        const angles = leverAngles(cockpit.state.knob);
        this.rotation.set(angles.x, 0, angles.z);
        this.bindings.gear_lever.quaternion.copy(this.leverNeutral).multiply(this.delta.setFromEuler(this.rotation));
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
        this.materials.clear();
    }
}
