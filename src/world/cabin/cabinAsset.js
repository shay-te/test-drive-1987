import { CABIN } from './cabinLayout.js';

/** Runtime-owned display meshes: the cluster, trip display, mirror picture and windshield. */
export const SURFACES = ['instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface'];
const PARTS = ['driver_eye', 'mirror_camera', 'steering_wheel', 'gear_lever', ...SURFACES];
for (let i = 0; i < CABIN.radar.leds; i++) PARTS.push(`radar_led_${i}`);

/** Validates exported glTF nodes or loaded scene objects and returns the required bindings. */
export function validateCabinNodes(nodes) {
    const bindings = {};
    for (const name of PARTS) {
        const matches = nodes.filter((node) => {
            return node.name === name;
        });
        if (matches.length !== 1) throw new Error(`Cabin requires exactly one node named "${name}"`);
        const node = matches[0];
        if ((SURFACES.includes(name) || name.startsWith('radar_led_')) && !node.isMesh && node.mesh === undefined)
            throw new Error(`Cabin node "${name}" must be a mesh`);
        const scale = Array.isArray(node.scale) ? node.scale : node.scale?.toArray();
        if (scale?.some((value) => {
            return !Number.isFinite(value) || value <= 0;
        })) throw new Error(`Cabin node "${name}" has an invalid scale`);
        bindings[name] = node;
    }
    return bindings;
}
