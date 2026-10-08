import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { SCENERY_MODELS } from '../data/scenery.js';
import { TRAFFIC_TYPES } from '../data/traffic.js';

/** Every authored model a stage places, with the nodes the runtime looks up in it. */
const STAGE_MODELS = [
    ...Object.values(TRAFFIC_TYPES).filter((spec) => { return spec.model; }).map((spec) => {
        return { path: spec.model, nodes: Object.values(spec.lightBar ?? {}) };
    }),
    ...Object.values(SCENERY_MODELS).map((spec) => { return { path: spec.model, nodes: [] }; }),
];

/** The authored models the world places (road users, scenery): loaded and checked once, copied per use. */
export class AuthoredModels {
    constructor(resources) {
        this.resources = resources;
        this.templates = new Map();
    }

    /** Loads every model a stage places. */
    prepare() {
        return Promise.all(STAGE_MODELS.map(({ path }) => { return this.load(path); }));
    }

    /** Loads one model (cached), failing if it lacks a node the runtime needs. */
    load(path) {
        const nodes = STAGE_MODELS.find((entry) => { return entry.path === path; })?.nodes ?? [];
        return this.resources.model(path, async (url) => {
            const scene = (await new GLTFLoader().loadAsync(url)).scene;
            for (const name of nodes) {
                if (!scene.getObjectByName(name)?.isMesh) throw new Error(`${path} has no mesh "${name}"`);
            }
            return scene;
        }).then((scene) => {
            this.templates.set(path, scene);
            return scene;
        });
    }

    /** A copy of a loaded model that shares its geometry and materials. */
    instance(path) {
        const template = this.templates.get(path);
        if (!template) throw new Error(`Model ${path} was not prepared`);
        return template.clone(true);
    }
}
