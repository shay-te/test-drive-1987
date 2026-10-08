import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { ROAD, VIEW } from '../config.js';
import { DEG } from '../util/math.js';
import { WorldMaterials } from './Materials.js';
import { WorldBuilder } from './WorldBuilder.js';
import { Terrain } from './Terrain.js';
import { buildTrees } from './Props.js';
import { VehicleModels } from './VehicleModels.js';

const FAR = 24000;
const SKY_SCALE = 18000;
const SHADOW_EXTENT = 70;
const SHADOW_AHEAD = 35;
const MIRROR_VFOV = 13;
const MIRROR_FAR = 2500;
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
        this.camera = new THREE.PerspectiveCamera(this._verticalFov(), VIEW.width / VIRTUAL_HEIGHT, 0.1, FAR);
        this.camera.setViewOffset(
            VIEW.width,
            VIRTUAL_HEIGHT,
            0,
            VIRTUAL_HEIGHT / 2 - VIEW.horizonY,
            VIEW.width,
            VIEW.height,
        );
        this.camera.rotation.order = 'YXZ';
        const m = VIEW.mirror;
        this.mirrorCamera = new THREE.PerspectiveCamera(MIRROR_VFOV, m.w / m.h, 0.5, MIRROR_FAR);
        this.mirrorCamera.rotation.order = 'YXZ';
        this.vehicles = new VehicleModels();
        this.models = new Map();
        this.scene = null;
        this._buildMirrorOverlay();
        display.onResize((scale) => {
            this._resize(scale);
        });
        this._resize(display.scale);
    }

    _verticalFov() {
        const focal = VIEW.width / 2 / Math.tan((VIEW.hfovDeg * DEG) / 2);
        return (2 * Math.atan(VIRTUAL_HEIGHT / 2 / focal)) / DEG;
    }

    _buildMirrorOverlay() {
        this.mirrorTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
        const texture = this.mirrorTarget.texture;
        // A mirror shows the rear view flipped left to right.
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        const m = VIEW.mirror;
        const quad = new THREE.Mesh(
            new THREE.PlaneGeometry(m.w, m.h),
            new THREE.MeshBasicMaterial({ map: texture }),
        );
        quad.position.set(m.x + m.w / 2, VIEW.height - (m.y + m.h / 2), 0);
        this.overlayScene = new THREE.Scene();
        this.overlayScene.add(quad);
        this.overlayCamera = new THREE.OrthographicCamera(0, VIEW.width, VIEW.height, 0, -1, 1);
    }

    _resize(scale) {
        const width = Math.round(VIEW.width * scale);
        const height = Math.round(VIEW.height * scale);
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(width, height, false);
        this.mirrorTarget.setSize(Math.round(VIEW.mirror.w * scale), Math.round(VIEW.mirror.h * scale));
        this.scale = scale;
    }

    /** Builds the 3D scene for a stage. */
    load(track, stage) {
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
        this.scene = scene;
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
        shadow.bias = -0.0004;
        shadow.normalBias = 0.06;
        scene.add(this.sun, this.sun.target);
        scene.add(new THREE.HemisphereLight('#c4daf5', '#7a6650', 3));
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

    /** Renders a frame; `view` = {s, u, theta, pitch, roll, lift, shakeX, shakeY, vehicles, time}. */
    render(view) {
        if (!this.scene) return;
        this._placeCamera(view);
        this._syncVehicles(view.vehicles, view.time);
        const focus = this.track.toWorld(view.s + SHADOW_AHEAD, 0);
        this.sun.target.position.set(focus.x, focus.y, focus.z);
        this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 450);
        this.sky.position.copy(this.camera.position);

        const r = this.renderer;
        const s = this.scale;
        const height = Math.round(VIEW.height * s);
        r.setScissorTest(true);
        r.setScissor(
            0,
            height - Math.round(VIEW.windshieldBottom * s),
            Math.round(VIEW.width * s),
            Math.round(VIEW.windshieldBottom * s),
        );
        r.render(this.scene, this.camera);

        this.sky.position.copy(this.mirrorCamera.position);
        r.setRenderTarget(this.mirrorTarget);
        r.setScissorTest(false);
        r.render(this.scene, this.mirrorCamera);
        r.setRenderTarget(null);
        r.autoClear = false;
        r.render(this.overlayScene, this.overlayCamera);
        r.autoClear = true;
    }

    _placeCamera(view) {
        const eye = this.track.toWorld(view.s, view.u + ROAD.eyeOffset, ROAD.eyeHeight + (view.lift ?? 0));
        const yaw = eye.heading + view.theta;
        this.camera.position.set(eye.x + (view.shakeX ?? 0), eye.y + (view.shakeY ?? 0), eye.z);
        this.camera.rotation.set(view.pitch, -yaw, view.roll);
        const mirror = this.track.toWorld(view.s - 0.4, view.u, ROAD.eyeHeight + 0.15 + (view.lift ?? 0));
        this.mirrorCamera.position.set(mirror.x, mirror.y, mirror.z);
        this.mirrorCamera.rotation.set(-view.pitch * 0.5, -yaw + Math.PI, 0);
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

    dispose() {
        if (!this.scene) return;
        this.scene.traverse((object) => {
            object.geometry?.dispose();
        });
        this.models.clear();
        this.scene = null;
    }
}
