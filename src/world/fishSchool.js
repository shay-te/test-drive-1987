import { WATER } from '../config.js';
import { TAU, createRng, lerp } from '../util/math.js';

/** Fish circling a sunk car at `centre` at `time` (s), each kept below the surface at `seaLevel`:
 *  [{ x, y, z, heading (rad, about y, 0 swimming towards -z), size (m), tail (-1..1 beat) }]. */
export function fishSchool(centre, time, seaLevel) {
    const f = WATER.fish;
    const rng = createRng(f.count);
    return Array.from({ length: f.count }, () => {
        const radius = rng.range(...f.radius);
        const direction = rng() < 0.5 ? -1 : 1;
        const angle = rng() * TAU + (direction * rng.range(...f.speed) * time) / radius;
        const depth = lerp(f.depth[0], f.depth[1], rng());
        const size = rng.range(...f.size);
        const beat = rng() * TAU;
        return {
            x: centre.x + Math.cos(angle) * radius,
            y: Math.min(centre.y + depth, seaLevel - size),
            z: centre.z + Math.sin(angle) * radius,
            // Swimming round the circle: along its tangent, the way the fish is going.
            heading: Math.atan2(direction * Math.sin(angle), -direction * Math.cos(angle)),
            size,
            tail: Math.sin(TAU * f.tailHz * time + beat),
        };
    });
}
