import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SURFACES } from './cabin/cabinAsset.js';
import { profileFrame } from './profileFrame.js';

/** Metres between the camera and the near side of the car. */
const CAMERA_GAP = 1;
const ENVIRONMENT_BLUR = 0.04;
const ENVIRONMENT_INTENSITY = 0.9;
const KEY_LIGHT = { color: '#fff4e6', intensity: 2.4, position: [-4, 6, -3] };
const FILL_LIGHT = { sky: '#dfe7f2', ground: '#2b1638', intensity: 0.7 };

/** Photographs an authored car model side-on into a transparent canvas. The game's own canvas is
 *  opaque, so the shot uses a renderer that lives only for it. */
export function photographProfile(template) {
    const car = template.clone(true);
    car.traverse((node) => {
        if (SURFACES.includes(node.name)) node.visible = false;
    });
    const bounds = new THREE.Box3().setFromObject(car);
    const frame = profileFrame(bounds.min, bounds.max);
    const depth = bounds.max.x - bounds.min.x + 2 * CAMERA_GAP;
    const camera = new THREE.OrthographicCamera(frame.left, frame.right, frame.top, frame.bottom, 0, depth);
    camera.position.set(bounds.min.x - CAMERA_GAP, 0, 0);
    camera.lookAt(bounds.max.x, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, ENVIRONMENT_BLUR);
    try {
        renderer.setSize(frame.width, frame.height, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        const key = new THREE.DirectionalLight(KEY_LIGHT.color, KEY_LIGHT.intensity);
        key.position.set(...KEY_LIGHT.position);
        const scene = new THREE.Scene();
        scene.environment = environment.texture;
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        scene.add(car, key, new THREE.HemisphereLight(FILL_LIGHT.sky, FILL_LIGHT.ground, FILL_LIGHT.intensity));
        renderer.render(scene, camera);
        // Copied in the same task as the render, before the drawing buffer is discarded.
        const photo = document.createElement('canvas');
        photo.width = frame.width;
        photo.height = frame.height;
        photo.getContext('2d').drawImage(renderer.domElement, 0, 0);
        return photo;
    } finally {
        environment.dispose();
        room.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
    }
}
