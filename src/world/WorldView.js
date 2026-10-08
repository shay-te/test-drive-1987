import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CHASE, CRASH, LIGHTING, VIEW } from '../config.js';
import { DEG } from '../util/math.js';
import { WorldMaterials } from './Materials.js';
import { WorldBuilder } from './WorldBuilder.js';
import { Terrain } from './Terrain.js';
import { buildTrees } from './Props.js';
import { VehicleModels } from './VehicleModels.js';
import { AuthoredModels } from './AuthoredModels.js';
import { SCENERY_MODELS } from '../data/scenery.js';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { AssetCabin } from './cabin/AssetCabin.js';
import { SIDE_MIRRORS, SURFACES, validateCabinNodes } from './cabin/cabinAsset.js';
import { CABIN } from './cabin/cabinLayout.js';
import { CABIN_LAYER } from './cabin/cabinLayer.js';
import { photographProfile } from './profilePhoto.js';
import { photographStation } from './stationPhoto.js';
import { chasePose, followYaw } from './chaseView.js';

const FAR = 24000;
const SKY_SCALE = 18000;
const SHADOW_EXTENT = 70;
const SHADOW_AHEAD = 35;
const MIRROR_VFOV = 13;
const MIRROR_FAR = 2500;
/** Mirror picture width in pixels at 1x scale. */
const MIRROR_TEXELS = 512;
/** Door mirrors: a small picture each, redrawn on alternate frames; the view a flat glass gives. */
const DOOR_MIRROR = { texels: 256, vfovDeg: 12 };

/** A render target for a mirror picture, flipped left to right as a mirror shows it. */
function mirrorTarget() {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    target.texture.wrapS = THREE.RepeatWrapping;
    target.texture.repeat.x = -1;
    return target;
}
const WORLD_NEAR = 0.3;
/** The cabin pass sees from the eye to the back of the car. */
const CABIN_NEAR = 0.02;
const CABIN_FAR = 8;
/** Virtual image height that puts the optical centre on VIEW.horizonY. */
const VIRTUAL_HEIGHT = 2 * (VIEW.height - VIEW.horizonY);

/** Renders the stage in 3D from the driver's seat, plus the rear-view mirror. */
export class WorldView {
    constructor(display, resources) {
        this.display = display;
        this.resources = resources;
        this.renderer = new THREE.WebGLRenderer({
            canvas: display.glCanvas,
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.camera = new THREE.PerspectiveCamera(
            this._verticalFov(),
            VIEW.width / VIRTUAL_HEIGHT,
            WORLD_NEAR,
            FAR,
        );
        this.camera.rotation.order = 'YXZ';
        this.camera.setViewOffset(
            VIEW.width,
            VIRTUAL_HEIGHT,
            0,
            VIRTUAL_HEIGHT / 2 - VIEW.horizonY,
            VIEW.width,
            VIEW.height,
        );
        const m = CABIN.mirror;
        this.mirrorCamera = new THREE.PerspectiveCamera(MIRROR_VFOV, m.w / m.h, 0.5, MIRROR_FAR);
        this.mirrorTarget = mirrorTarget();
        this.doorMirrors = Object.fromEntries(SIDE_MIRRORS.map((side) => {
            const camera = new THREE.PerspectiveCamera(DOOR_MIRROR.vfovDeg, 1, 0.5, MIRROR_FAR);
            return [side, { camera, target: mirrorTarget(), aspect: 1 }];
        }));
        this.activeDoorMirrors = [];
        this.frame = 0;
        this.authored = new AuthoredModels(resources);
        this.vehicles = new VehicleModels(this.authored);
        // The outside view sees the car (cabin layer) and the world in one pass, lit by the world's sun.
        this.chaseCamera = new THREE.PerspectiveCamera(CHASE.verticalFovDeg, VIEW.width / VIEW.height, WORLD_NEAR, FAR);
        this.chaseCamera.layers.enable(CABIN_LAYER);
        this.chaseYaw = null;
        this.chaseTime = null;
        this.models = new Map();
        this.scene = null;
        this.cabin = null;
        display.onResize((scale) => {
            this._resize(scale);
        });
        this._resize(display.scale);
    }

    _verticalFov() {
        const focal = VIEW.width / 2 / Math.tan((VIEW.hfovDeg * DEG) / 2);
        return (2 * Math.atan(VIRTUAL_HEIGHT / 2 / focal)) / DEG;
    }

    _resize(scale) {
        const width = Math.round(VIEW.width * scale);
        const height = Math.round(VIEW.height * scale);
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(width, height, false);
        const m = CABIN.mirror;
        this.mirrorTarget.setSize(
            Math.round(MIRROR_TEXELS * scale),
            Math.round((MIRROR_TEXELS * scale * m.h) / m.w),
        );
        for (const mirror of Object.values(this.doorMirrors)) {
            mirror.target.setSize(Math.round(DOOR_MIRROR.texels * scale), Math.round((DOOR_MIRROR.texels * scale) / mirror.aspect));
        }
        this.scale = scale;
    }

    /** Loads everything a stage with `car` needs before scene construction: its cabin (resolved, null
     *  without one), the road users' and the scenery models. */
    prepare(car) {
        return Promise.all([this.prepareCabin(car), this.authored.prepare()]).then(([cabin]) => { return cabin; });
    }

    /** Loads and validates the car's cached cabin asset (null for a car without one). */
    prepareCabin(car) {
        if (!car.cockpit.model) return null;
        return this.resources.model(car.cockpit.model, async (url) => {
            const asset = await new GLTFLoader().loadAsync(url);
            const nodes = [];
            asset.scene.traverse((node) => { nodes.push(node); });
            const bindings = validateCabinNodes(nodes);
            for (const name of SURFACES) {
                if (!bindings[name].geometry.attributes.uv) throw new Error(`Cabin surface "${name}" has no UVs`);
            }
            return asset.scene;
        });
    }

    /** A side-on photo of the car's authored model (null without one), taken once per session. */
    profile(car) {
        if (!car.cockpit.model) return null;
        return this.resources.memo(`profile:${car.id}`, async () => {
            return photographProfile(await this.prepareCabin(car));
        });
    }

    /** The gas station with `car` filling up, photographed once per car for a screen of the given `look`
     *  ({ width, height, horizonY, ground }); null for a car without a model. */
    stationScene(car, look) {
        if (!car.cockpit.model) return null;
        const station = SCENERY_MODELS.station;
        return this.resources.memo(`station-scene:${car.id}`, async () => {
            const [template, cabin] = await Promise.all([this.authored.load(station.model), this.prepareCabin(car)]);
            return photographStation(template, cabin, { ...look, bay: station.bay });
        });
    }

    load(track, stage, car, landscape, cabinAsset = null) {
        this.dispose();
        this.track = track;
        const scene = new THREE.Scene();
        const materials = new WorldMaterials(this.resources, this.renderer, stage);
        const builder = new WorldBuilder(materials, stage, landscape, this.authored);
        const terrain = new Terrain(landscape, stage, materials);
        scene.add(builder.build(track), terrain.mesh, terrain.ring);
        scene.add(buildTrees([...builder.treePlacements(track), ...terrain.treePlacements()], materials));
        scene.fog = new THREE.FogExp2(stage.fog.color, stage.fog.density);
        this._installCabin(scene, stage, car, cabinAsset);
    }

    loadPreview(stage, car, cabinAsset) {
        this.dispose();
        this.track = null;
        this._installCabin(new THREE.Scene(), stage, car, cabinAsset);
    }

    _installCabin(scene, stage, car, cabinAsset) {
        this._addSkyAndSun(scene, stage);
        this.renderer.toneMappingExposure = stage.sky.exposure;
        this.cabin = new AssetCabin(
            car,
            this.resources,
            this.renderer.capabilities.getMaxAnisotropy(),
            this.mirrorTarget.texture,
            cabinAsset,
            Object.fromEntries(Object.entries(this.doorMirrors).map(([side, mirror]) => { return [side, mirror.target.texture]; })),
        );
        this.cabin.root.rotation.order = 'YXZ';
        this.cabin.eye.add(this.camera);
        this.cabin.mirrorMount.add(this.mirrorCamera);
        this._mountDoorMirrors(this.cabin.sideMirrors ?? {});
        scene.add(this.cabin.root);
        this._addCabinLights(scene);
        scene.environment = this._environment(scene);
        scene.environmentIntensity = LIGHTING.environmentIntensity;
        this.scene = scene;
    }

    /** Hangs a camera on each door mirror the cabin has, shaped like its glass. */
    _mountDoorMirrors(sideMirrors) {
        this.activeDoorMirrors = Object.entries(sideMirrors).map(([side, { surface, camera: mount }]) => {
            const mirror = this.doorMirrors[side];
            surface.geometry.computeBoundingBox();
            const size = surface.geometry.boundingBox.getSize(new THREE.Vector3());
            mirror.aspect = size.x / size.y;
            mirror.camera.aspect = mirror.aspect;
            mirror.camera.updateProjectionMatrix();
            mount.add(mirror.camera);
            return mirror;
        });
        this._resize(this.scale);
    }

    /** The cabin's own sun (with a tight, sharp shadow map over the car) and the sky through the glass. */
    _addCabinLights(scene) {
        this.cabinSun = this.sun.clone();
        const shadow = this.cabinSun.shadow;
        shadow.mapSize.set(1024, 1024);
        Object.assign(shadow.camera, {
            left: -LIGHTING.cabinShadowExtent,
            right: LIGHTING.cabinShadowExtent,
            top: LIGHTING.cabinShadowExtent,
            bottom: -LIGHTING.cabinShadowExtent,
            near: 0.5,
            far: 20,
        });
        shadow.camera.updateProjectionMatrix();
        shadow.bias = -0.0002;
        shadow.normalBias = LIGHTING.cabinShadowNormalBias;
        const sky = this.skyLight.clone();
        sky.intensity *= LIGHTING.cabinSky;
        this.cabinLights = [this.cabinSun, sky];
        for (const light of this.cabinLights) light.layers.set(CABIN_LAYER);
        scene.add(this.cabinSun, this.cabinSun.target, sky);
    }

    _addSkyAndSun(scene, stage) {
        const elevation = stage.sun.elevation * DEG;
        const azimuth = stage.sun.azimuth * DEG;
        this.sunDirection = new THREE.Vector3(
            Math.sin(azimuth) * Math.cos(elevation),
            Math.sin(elevation),
            -Math.cos(azimuth) * Math.cos(elevation),
        );
        this.sky = new Sky();
        this.sky.scale.setScalar(SKY_SCALE);
        const u = this.sky.material.uniforms;
        u.turbidity.value = stage.sky.turbidity;
        u.rayleigh.value = stage.sky.rayleigh;
        u.mieCoefficient.value = stage.sky.mie;
        u.mieDirectionalG.value = 0.8;
        u.sunPosition.value.copy(this.sunDirection);
        scene.add(this.sky);

        const warmth = Math.min(1, stage.sun.elevation / 35);
        this.sun = new THREE.DirectionalLight(
            new THREE.Color().setHSL(0.09, 0.7 - warmth * 0.45, 0.62 + warmth * 0.3),
            3.2,
        );
        this.sun.castShadow = true;
        const shadow = this.sun.shadow;
        shadow.mapSize.set(2048, 2048);
        Object.assign(shadow.camera, {
            left: -SHADOW_EXTENT,
            right: SHADOW_EXTENT,
            top: SHADOW_EXTENT,
            bottom: -SHADOW_EXTENT,
            near: 1,
            far: 900,
        });
        shadow.camera.updateProjectionMatrix();
        shadow.bias = -0.0004;
        shadow.normalBias = 0.06;
        scene.add(this.sun, this.sun.target);
        this.skyLight = new THREE.HemisphereLight(stage.fog.color, stage.rockDark, LIGHTING.skyIntensity);
        scene.add(this.skyLight);
    }

    /** Capture the stage once: road and rock contrast belongs in reflections as well as the sky. */
    _environment(scene) {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const start = this.track?.toWorld(0, 0) ?? { x: 0, y: 0, z: 0 };
        const position = new THREE.Vector3(start.x, start.y + LIGHTING.environmentHeight, start.z);
        this.sky.position.copy(position);
        this.sun.target.position.copy(position);
        this.sun.position.copy(position).addScaledVector(this.sunDirection, 450);
        // Include ground colour in the isolated preview's reflections.
        const ground = this.track ? null : new THREE.Mesh(
            new THREE.CircleGeometry(LIGHTING.groundRadius),
            new THREE.MeshBasicMaterial({ color: LIGHTING.groundColor }),
        );
        if (ground) {
            ground.rotation.x = -Math.PI / 2;
            scene.add(ground);
        }
        try {
            this.environmentTarget = pmrem.fromScene(scene, 0, LIGHTING.environmentNear, FAR, {
                size: LIGHTING.environmentSize, position,
            });
            return this.environmentTarget.texture;
        } finally {
            if (ground) {
                scene.remove(ground);
                ground.geometry.dispose();
                ground.material.dispose();
            }
            pmrem.dispose();
        }
    }

    /** Renders a frame. `view` = {s, u, theta, pitch, roll, pose, head, cockpit, vehicles, time}: the
     *  car on the road (or its free `pose` when falling), the driver's head and the cabin's moving parts. */
    render(view) {
        if (!this.scene) return;
        this._placeCar(view);
        this._syncVehicles(view.vehicles, view.time);
        this.cabin.update(view.cockpit);
        const focus = view.pose?.position ?? this.track.toWorld(view.s + SHADOW_AHEAD, 0);
        this.sun.target.position.set(focus.x, focus.y, focus.z);
        this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 450);
        const car = this.cabin.root.position;
        this.cabinSun.target.position.copy(car);
        this.cabinSun.position.copy(car).addScaledVector(this.sunDirection, 10);
        this.scene.updateMatrixWorld();

        const r = this.renderer;
        const outside = view.outside || view.spectator;
        for (const light of this.cabinLights) light.visible = !outside;
        if (outside) {
            if (view.spectator) this._placeSpectator(view.spectator);
            else this._placeChase(view.time);
            this.chaseCamera.getWorldPosition(this.sky.position);
            r.render(this.scene, this.chaseCamera);
            return;
        }
        this.chaseYaw = null;
        this._renderMirror(this.mirrorCamera, this.mirrorTarget);
        const doors = this.activeDoorMirrors;
        if (doors.length) {
            const door = doors[this.frame++ % doors.length];
            this._renderMirror(door.camera, door.target);
        }

        this.camera.getWorldPosition(this.sky.position);
        this._lens(0, WORLD_NEAR, FAR);
        r.render(this.scene, this.camera);
        // The cabin is drawn last over a cleared depth buffer, so its near plane can sit at the eye.
        this._lens(CABIN_LAYER, CABIN_NEAR, CABIN_FAR);
        r.autoClear = false;
        r.clearDepth();
        r.render(this.scene, this.camera);
        r.autoClear = true;
    }

    /** Watching a crash from beside the road where it happened: behind the impact, out over the drop,
     *  following the player's car wherever it is thrown. */
    _placeSpectator({ s, u }) {
        const c = CRASH.camera;
        const at = this.track.toWorld(s - c.back, u - c.out);
        const car = this.cabin.root.position;
        this.chaseCamera.position.set(at.x, at.y + c.up, at.z);
        this.chaseCamera.lookAt(car.x, car.y + c.aimUp, car.z);
        this.chaseCamera.updateMatrixWorld();
        this.chaseYaw = null;
    }

    /** Behind and above the car, its yaw easing after the car's heading (also while it tumbles). */
    _placeChase(time) {
        const root = this.cabin.root;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
        const dt = this.chaseTime === null ? 0 : Math.max(0, time - this.chaseTime);
        this.chaseTime = time;
        this.chaseYaw = followYaw(this.chaseYaw, Math.atan2(-forward.x, -forward.z), dt);
        const { position, aim } = chasePose(root.position, this.chaseYaw);
        this.chaseCamera.position.set(...position);
        this.chaseCamera.lookAt(...aim);
        this.chaseCamera.updateMatrixWorld();
    }

    _renderMirror(camera, target) {
        const r = this.renderer;
        camera.getWorldPosition(this.sky.position);
        r.setRenderTarget(target);
        r.render(this.scene, camera);
        r.setRenderTarget(null);
    }

    _lens(layer, near, far) {
        this.camera.layers.set(layer);
        this.camera.near = near;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
    }

    /** Puts the car (and the cabin with it) on the road, and the driver's head in the seat. */
    _placeCar(view) {
        const root = this.cabin.root;
        if (view.pose) {
            // Off the road the car is a free rigid body: take its pose as it is.
            const { position, quaternion: q } = view.pose;
            root.position.set(position.x, position.y, position.z);
            root.quaternion.set(q.x, q.y, q.z, q.w);
        } else {
            const p = this.track.toWorld(view.s, view.u);
            root.position.set(p.x, p.y, p.z);
            root.rotation.set(view.pitch, -(p.heading + view.theta), view.roll);
        }
        const head = view.head;
        this.camera.position.set(head.x, head.y, head.z);
        this.camera.rotation.set(head.pitch, head.yaw, head.roll);
    }

    _syncVehicles(vehicles, time) {
        const seen = new Set();
        for (const v of vehicles) {
            seen.add(v.id);
            let model = this.models.get(v.id);
            if (!model) {
                model = this.vehicles.create(v);
                this.models.set(v.id, model);
                this.scene.add(model);
            }
            if (v.pose) {
                // A wrecked car flies free of the road.
                const { position, quaternion: q } = v.pose;
                model.position.set(position.x, position.y, position.z);
                model.quaternion.set(q.x, q.y, q.z, q.w);
            } else {
                const p = this.track.toWorld(v.s, v.u);
                model.position.set(p.x, p.y, p.z);
                model.rotation.set(0, -p.heading + (v.dir < 0 ? Math.PI : 0), 0);
            }
            model.userData.siren = Boolean(v.siren);
            this.vehicles.animate(model, time);
        }
        for (const [id, model] of this.models) {
            if (seen.has(id)) continue;
            this.scene.remove(model);
            this.models.delete(id);
        }
    }

    /** Blanks the 3D canvas (menus draw over an empty world). */
    clear() {
        this.renderer.setScissorTest(false);
        this.renderer.setClearColor(0x000000, 1);
        this.renderer.clear();
    }

    dispose() {
        if (!this.scene) return;
        this.scene.remove(this.cabin.root);
        this.cabin.dispose();
        this.cabin = null;
        for (const model of this.models.values()) this.scene.remove(model);
        const materials = new Set();
        const textures = new Set();
        this.scene.traverse((object) => {
            object.geometry?.dispose();
            object.shadow?.dispose();
            const entries = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of entries) if (material) materials.add(material);
        });
        for (const material of materials) {
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            material.dispose();
        }
        for (const texture of textures) texture.dispose();
        this.environmentTarget?.dispose();
        this.models.clear();
        this.scene = null;
    }
}
