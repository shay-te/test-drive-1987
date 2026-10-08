/** Studio view of a car model for measuring where its parts are, driven by URL parameters:
 *  model (repo path), view (eye|side|top|front|back), eye "x,y,z", yaw, pitch, centre "x,y,z", zoom,
 *  hide (comma-separated part or material names; three.js turns spaces into underscores).
 *  `window.pick(x, y)` returns the part, material, point and normal under that pixel. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { VIEW } from '../src/config.js';
import { DEG } from '../src/util/math.js';

const params = new URL(location.href).searchParams;
const vector = (text) => { return new THREE.Vector3(...text.split(',').map(Number)); };
const STUDIO = { background: '#8fa3b8', sky: '#ffffff', ground: '#444444', fill: 1.2, sun: 2, sunAt: [-3, 6, -2] };
const DIRECTIONS = { side: [-1, 0, 0], top: [0, 1, 0], front: [0, 0, -1], back: [0, 0, 1] };
const DISTANCE = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(VIEW.width, VIEW.height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(STUDIO.background);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment()).texture;
const sun = new THREE.DirectionalLight(STUDIO.sky, STUDIO.sun);
sun.position.set(...STUDIO.sunAt);
scene.add(new THREE.HemisphereLight(STUDIO.sky, STUDIO.ground, STUDIO.fill), sun);

const hide = (params.get('hide') ?? '').split(',').filter(Boolean);
const model = (await new GLTFLoader().loadAsync(`../${params.get('model')}`)).scene;
model.traverse((node) => {
    if (node.isMesh && hide.some((name) => { return node.name.includes(name) || node.material.name.includes(name); })) node.visible = false;
});
scene.add(model);

const view = params.get('view') ?? 'eye';
let camera;
if (view === 'eye') {
    const vfov = 2 * Math.atan(Math.tan((VIEW.hfovDeg * DEG) / 2) * VIEW.height / VIEW.width);
    camera = new THREE.PerspectiveCamera(vfov / DEG, VIEW.width / VIEW.height, 0.02, 100);
    camera.position.copy(vector(params.get('eye') ?? '-0.36,1,0'));
    camera.rotation.order = 'YXZ';
    camera.rotation.set(Number(params.get('pitch') ?? 0), Number(params.get('yaw') ?? 0), 0);
} else {
    const half = Number(params.get('zoom') ?? 1.4);
    const aspect = VIEW.width / VIEW.height;
    camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -DISTANCE * 5, DISTANCE * 5);
    const centre = vector(params.get('centre') ?? '0,0.6,0');
    camera.position.copy(centre).add(new THREE.Vector3(...DIRECTIONS[view]).multiplyScalar(DISTANCE));
    // From above, the car's left (-x) is up the screen and its nose to the right.
    if (view === 'top') camera.up.set(-1, 0, 0);
    camera.lookAt(centre);
}
renderer.render(scene, camera);

window.pick = (x, y) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / VIEW.width) * 2 - 1, 1 - (y / VIEW.height) * 2), camera);
    const hit = ray.intersectObject(model, true).find((h) => { return h.object.visible; });
    if (!hit) return null;
    const round = (v) => { return v.toArray().map((c) => { return Number(c.toFixed(3)); }); };
    return {
        part: hit.object.name,
        material: hit.object.material.name,
        point: round(hit.point),
        normal: round(hit.face.normal.clone().transformDirection(hit.object.matrixWorld)),
    };
};
window.viewerReady = true;
