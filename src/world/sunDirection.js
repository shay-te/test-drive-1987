import { DEG } from '../util/math.js';

/** Unit vector towards the sun in world space, for `sun` = { elevation, azimuth } (deg, the azimuth from
 *  north, clockwise) over a road that starts on compass `bearing` (deg) along the world's -z. */
export function sunDirection(sun, bearing) {
    const elevation = sun.elevation * DEG;
    const azimuth = (sun.azimuth - bearing) * DEG;
    return {
        x: Math.sin(azimuth) * Math.cos(elevation),
        y: Math.sin(elevation),
        z: -Math.cos(azimuth) * Math.cos(elevation),
    };
}
