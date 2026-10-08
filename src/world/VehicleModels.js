import { TRAFFIC_TYPES } from '../data/traffic.js';

const LIGHT_BAR_FLASH_HZ = 2.6;
const LIGHT_BAR_GLOW = { flash: 6, idle: 0.2 };

/** Places the road users' authored models and flashes the patrol cars' light bars. */
export class VehicleModels {
    constructor(authored) {
        this.authored = authored;
    }

    /** A new model for `vehicle`, sharing its type's geometry; local -z is its front. Light bar lenses get
     *  materials of their own to flash. */
    create(vehicle) {
        const spec = TRAFFIC_TYPES[vehicle.type];
        const group = this.authored.instance(spec.model);
        group.traverse((child) => {
            child.castShadow = true;
        });
        if (spec.lightBar) {
            const lens = (name) => {
                const mesh = group.getObjectByName(name);
                mesh.material = mesh.material.clone();
                return mesh.material;
            };
            group.userData.lightBar = { red: lens(spec.lightBar.red), blue: lens(spec.lightBar.blue) };
            group.userData.siren = Boolean(vehicle.siren);
        }
        return group;
    }

    /** Flashes the patrol car light bar (red/blue alternating). */
    animate(group, time) {
        const bar = group.userData.lightBar;
        if (!bar) return;
        const phase = Math.floor(time * LIGHT_BAR_FLASH_HZ * 2) % 2;
        bar.red.emissiveIntensity = group.userData.siren && phase === 0 ? LIGHT_BAR_GLOW.flash : LIGHT_BAR_GLOW.idle;
        bar.blue.emissiveIntensity = group.userData.siren && phase === 1 ? LIGHT_BAR_GLOW.flash : LIGHT_BAR_GLOW.idle;
    }
}
