import * as THREE from 'three';
import { photoCar, snapshot } from './snapshot.js';

/** Pixels per logical pixel: sharp at the display's 2x cap. */
const PHOTO_SCALE = 2;
const VERTICAL_FOV_DEG = 42;
/** Camera and aim relative to the parking bay, metres in the station's frame (x away from the road,
 *  -z along it): from the road, ahead of the car, looking back across it at the pumps. */
const CAMERA = { from: [-10.5, 1.45, -9], at: [1.5, 1.45, 2.5] };
const GROUND_RADIUS = 80;
const SUN = { color: '#fff6e4', intensity: 2.6, from: [-14, 22, -10], shadowExtent: 18, shadowMap: 2048 };
const FILL = { sky: '#cfe3f5', ground: '#55524c', intensity: 0.9 };
const ENVIRONMENT_INTENSITY = 0.6;

/** Photographs the gas station with `car` filling up at `bay` ([x, z] in the station's frame), for a
 *  `width` x `height` screen whose painted horizon is at `horizonY`: transparent sky, `ground` beneath. */
export function photographStation(stationTemplate, carTemplate, { bay, width, height, horizonY, ground }) {
    const station = stationTemplate.clone(true);
    const car = photoCar(carTemplate);
    const bounds = new THREE.Box3().setFromObject(car);
    car.position.set(bay[0] - (bounds.min.x + bounds.max.x) / 2, 0, bay[1] - (bounds.min.z + bounds.max.z) / 2);
    for (const model of [station, car]) {
        model.traverse((node) => {
            node.castShadow = true;
            node.receiveShadow = true;
        });
    }
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(GROUND_RADIUS, 48).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: ground, roughness: 0.95 }),
    );
    floor.position.set(bay[0], 0, bay[1]);
    floor.receiveShadow = true;

    const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
    sun.position.set(bay[0] + SUN.from[0], SUN.from[1], bay[1] + SUN.from[2]);
    sun.target.position.set(bay[0], 0, bay[1]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SUN.shadowMap, SUN.shadowMap);
    Object.assign(sun.shadow.camera, {
        left: -SUN.shadowExtent, right: SUN.shadowExtent, top: SUN.shadowExtent, bottom: -SUN.shadowExtent,
    });
    const scene = new THREE.Scene();
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    scene.add(station, car, floor, sun, sun.target, new THREE.HemisphereLight(FILL.sky, FILL.ground, FILL.intensity));

    // A level camera puts the horizon at the middle of its frame; a frame twice the horizon's height,
    // cropped to the screen, puts it on the painted one.
    const camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEG, width / (2 * horizonY), 0.1, 400);
    camera.setViewOffset(width, 2 * horizonY, 0, 0, width, height);
    camera.position.set(bay[0] + CAMERA.from[0], CAMERA.from[1], bay[1] + CAMERA.from[2]);
    camera.lookAt(bay[0] + CAMERA.at[0], CAMERA.at[1], bay[1] + CAMERA.at[2]);
    camera.updateProjectionMatrix();
    return snapshot(scene, camera, width * PHOTO_SCALE, height * PHOTO_SCALE, { shadows: true });
}
