import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SURFACES } from './cabin/cabinAsset.js';

const ENVIRONMENT_BLUR = 0.04;

/** A copy of an authored car for a photo, without the runtime display surfaces (they are blank). */
export function photoCar(template) {
    const car = template.clone(true);
    car.traverse((node) => {
        if (SURFACES.includes(node.name)) node.visible = false;
    });
    return car;
}

/** Renders `scene` from `camera` once into a new transparent canvas, with studio reflections. The game's
 *  own canvas is opaque, so the shot uses a renderer that lives only for it. */
export function snapshot(scene, camera, width, height, { shadows = false } = {}) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, ENVIRONMENT_BLUR);
    try {
        renderer.setSize(width, height, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.shadowMap.enabled = shadows;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.environment = environment.texture;
        renderer.render(scene, camera);
        // Copied in the same task as the render, before the drawing buffer is discarded.
        const photo = document.createElement('canvas');
        photo.width = width;
        photo.height = height;
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
