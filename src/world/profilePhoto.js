import * as THREE from 'three';
import { profileFrame } from './profileFrame.js';
import { photoCar, snapshot } from './snapshot.js';

/** Metres between the camera and the near side of the car. */
const CAMERA_GAP = 1;
const ENVIRONMENT_INTENSITY = 0.9;
const KEY_LIGHT = { color: '#fff4e6', intensity: 2.4, position: [-4, 6, -3] };
const FILL_LIGHT = { sky: '#dfe7f2', ground: '#2b1638', intensity: 0.7 };

/** Photographs an authored car model side-on into a transparent canvas. */
export function photographProfile(template) {
    const car = photoCar(template);
    const bounds = new THREE.Box3().setFromObject(car);
    const frame = profileFrame(bounds.min, bounds.max);
    const depth = bounds.max.x - bounds.min.x + 2 * CAMERA_GAP;
    const camera = new THREE.OrthographicCamera(frame.left, frame.right, frame.top, frame.bottom, 0, depth);
    camera.position.set(bounds.min.x - CAMERA_GAP, 0, 0);
    camera.lookAt(bounds.max.x, 0, 0);
    const key = new THREE.DirectionalLight(KEY_LIGHT.color, KEY_LIGHT.intensity);
    key.position.set(...KEY_LIGHT.position);
    const scene = new THREE.Scene();
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    scene.add(car, key, new THREE.HemisphereLight(FILL_LIGHT.sky, FILL_LIGHT.ground, FILL_LIGHT.intensity));
    return snapshot(scene, camera, frame.width, frame.height);
}
