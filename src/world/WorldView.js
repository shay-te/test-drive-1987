import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { VIEW } from '../config.js';
import { DEG } from '../util/math.js';
import { WorldMaterials } from './Materials.js';
import { WorldBuilder } from './WorldBuilder.js';
import { Terrain } from './Terrain.js';
import { buildTrees } from './Props.js';
import { VehicleModels } from './VehicleModels.js';
import { CarCabin } from './cabin/CarCabin.js';
import { CABIN } from './cabin/cabinLayout.js';
import { CABIN_LAYER } from './cabin/shapes.js';

const FAR = 24000;
const SKY_SCALE = 18000;
const SHADOW_EXTENT = 70;
const SHADOW_AHEAD = 35;
const MIRROR_VFOV = 13;
const MIRROR_FAR = 2500;
/** Mirror picture width in pixels at 1x scale. */
const MIRROR_TEXELS = 512;
const WORLD_NEAR = 0.3;
/** The cabin pass sees from the eye to the back of the car. */
const CABIN_NEAR = 0.02;
const CABIN_FAR = 8;
/** Half size of the cabin's own shadow map, which only has to cover the car. */
const CABIN_SHADOW = 1.8;
/** Sky light reaching the cabin through the glass, relative to the open road. */
const CABIN_SKY = 0.45;
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
        this.camera.setViewOffset(
            VIEW.width,
            VIRTUAL_HEIGHT,
            0,
            VIRTUAL_HEIGHT / 2 - VIEW.horizonY,
            VIEW.width,
            VIEW.height,
        );
        this.camera.rotation.order = 'YXZ';
        const m = CABIN.mirror;
        this.mirrorCamera = new THREE.PerspectiveCamera(MIRROR_VFOV, m.w / m.h, 0.5, MIRROR_FAR);
        this.mirrorTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
        // A mirror shows the rear view flipped left to right.
        this.mirrorTarget.texture.wrapS = THREE.RepeatWrapping;
        this.mirrorTarget.texture.repeat.x = -1;
        this.vehicles = new VehicleModels();
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
        this.scale = scale;
    }

    /** Builds the 3D scene for a stage, with `car`'s cabin around the driver. */
    load(track, stage, car) {
        this.dispose();
        this.track = track;
        const scene = new THREE.Scene();
        const materials = new WorldMaterials(this.resources, this.renderer, stage);
        const builder = new WorldBuilder(materials, stage);
        const terrain = new Terrain(track, stage, materials);
        scene.add(builder.build(track), terrain.mesh, terrain.ring);
        scene.add(buildTrees([...builder.treePlacements(track), ...terrain.treePlacements()], materials));
        scene.fog = new THREE.FogExp2(stage.fog.color, stage.fog.density);
        this._addSkyAndSun(scene, stage);
        this.renderer.toneMappingExposure = stage.sky.exposure;
        this.cabin = new CarCabin(
            car,
            this.resources,
            this.renderer.capabilities.getMaxAnisotropy(),
            this.mirrorTarget.texture,
        );
        this.cabin.root.rotation.order = 'YXZ';
        this.cabin.eye.add(this.camera);
        this.cabin.mirrorMount.add(this.mirrorCamera);
        scene.add(this.cabin.root);
        this._addCabinLights(scene);
        this.scene = scene;
    }

    /** The cabin's own sun (with a tight, sharp shadow map over the car) and the sky through the glass. */
    _addCabinLights(scene) {
        this.cabinSun = this.sun.clone();
        const shadow = this.cabinSun.shadow;
        shadow.mapSize.set(1024, 1024);
        Object.assign(shadow.camera, {
            left: -CABIN_SHADOW,
            right: CABIN_SHADOW,
            top: CABIN_SHADOW,
            bottom: -CABIN_SHADOW,
            near: 0.5,
            far: 20,
        });
        shadow.camera.updateProjectionMatrix();
        shadow.bias = -0.0002;
        shadow.normalBias = 0.01;
        const sky = this.skyLight.clone();
        sky.intensity *= CABIN_SKY;
        for (const light of [this.cabinSun, sky]) light.layers.set(CABIN_LAYER);
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
        scene.environment = this._skyEnvironment();

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
        this.skyLight = new THREE.HemisphereLight('#c4daf5', '#7a6650', 3);
        scene.add(this.skyLight);
    }

    /** Image-based lighting baked from the sky, so paint, glass and steel reflect it. */
    _skyEnvironment() {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const skyScene = new THREE.Scene();
        skyScene.add(this.sky.clone());
        const texture = pmrem.fromScene(skyScene).texture;
        pmrem.dispose();
        return texture;
    }

    /** Renders a frame. `view` = {s, u, theta, pitch, roll, lift, head, cockpit, vehicles, time}:
     *  the car's pose on the road, the driver's head (HeadMotion) and the cabin's moving parts. */
    render(view) {
        if (!this.scene) return;
        this._placeCar(view);
        this._syncVehicles(view.vehicles, view.time);
        this.cabin.update(view.cockpit);
        const focus = this.track.toWorld(view.s + SHADOW_AHEAD, 0);
        this.sun.target.position.set(focus.x, focus.y, focus.z);
        this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 450);
        const car = this.cabin.root.position;
        this.cabinSun.target.position.copy(car);
        this.cabinSun.position.copy(car).addScaledVector(this.sunDirection, 10);
        this.scene.updateMatrixWorld();

        const r = this.renderer;
        this.mirrorCamera.getWorldPosition(this.sky.position);
        r.setRenderTarget(this.mirrorTarget);
        r.render(this.scene, this.mirrorCamera);
        r.setRenderTarget(null);

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

    _lens(layer, near, far) {
        this.camera.layers.set(layer);
        this.camera.near = near;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
    }

    /** Puts the car (and the cabin with it) on the road, and the driver's head in the seat. */
    _placeCar(view) {
        const p = this.track.toWorld(view.s, view.u, view.lift ?? 0);
        const root = this.cabin.root;
        root.position.set(p.x, p.y, p.z);
        root.rotation.set(view.pitch, -(p.heading + view.theta), view.roll);
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
            const p = this.track.toWorld(v.s, v.u);
            model.position.set(p.x, p.y, p.z);
            model.rotation.y = -p.heading + (v.dir < 0 ? Math.PI : 0);
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
        this.scene.traverse((object) => {
            object.geometry?.dispose();
        });
        this.models.clear();
        this.scene = null;
    }
}
