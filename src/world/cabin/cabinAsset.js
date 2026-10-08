import { CABIN } from './cabinLayout.js';

/** Runtime-owned display meshes: the cluster, trip display, mirror picture and windshield. */
export const SURFACES = ['instrument_surface', 'trip_surface', 'mirror_surface', 'windshield_surface'];
const PARTS = ['driver_eye', 'mirror_camera', 'steering_wheel', 'gear_lever', ...SURFACES];
for (let i = 0; i < CABIN.radar.leds; i++) PARTS.push(`radar_led_${i}`);

/** Door mirrors a cabin may have; each is a `mirror_<side>_surface` mesh with its `mirror_<side>_camera`. */
export const SIDE_MIRRORS = ['left', 'right'];

/** The door mirrors present in exported glTF nodes or loaded scene objects, as { side: { surface,
 *  camera } }; a surface without its camera (or the reverse) is an error. */
export function sideMirrorNodes(nodes) {
    const found = {};
    for (const side of SIDE_MIRRORS) {
        const named = (name) => { return nodes.filter((node) => { return node.name === name; }); };
        const [surfaces, cameras] = [named(`mirror_${side}_surface`), named(`mirror_${side}_camera`)];
        if (!surfaces.length && !cameras.length) continue;
        if (surfaces.length !== 1 || cameras.length !== 1) throw new Error(`Cabin ${side} door mirror needs one surface and one camera`);
        if (!surfaces[0].isMesh && surfaces[0].mesh === undefined) throw new Error(`Cabin ${side} door mirror surface must be a mesh`);
        found[side] = { surface: surfaces[0], camera: cameras[0] };
    }
    return found;
}

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
