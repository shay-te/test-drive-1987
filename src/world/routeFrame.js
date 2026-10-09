import { DEG } from '../util/math.js';

// Where a stage lies on the map. The world's -z runs along the stage's first heading (`track.bearing`)
// from its first node (`track.routeOrigin`, in the route's local map metres east and north).

/** World (x, z) of the place at (lat, lon). */
export function worldOf(track, lat, lon) {
    const { origin, metresPerDegree } = track.stage.route;
    const dx = (lon - origin[1]) * metresPerDegree[0] - track.routeOrigin[0];
    const dy = (lat - origin[0]) * metresPerDegree[1] - track.routeOrigin[1];
    const b = track.bearing * DEG;
    return { x: dx * Math.cos(b) - dy * Math.sin(b), z: -(dx * Math.sin(b) + dy * Math.cos(b)) };
}

/** The points ([[lat, lon], ...]) the route's data packs as `p` (scripts/geo.mjs packMicro):
 *  microdegrees, the first point whole and each next one as a step from the last. */
export function unpackMicro(p) {
    const points = [];
    let [lat, lon] = [0, 0];
    for (let k = 0; k < p.length; k += 2) {
        lat += p[k];
        lon += p[k + 1];
        points.push([lat / 1e6, lon / 1e6]);
    }
    return points;
}

/** [lat, lon] of world point (x, z). */
export function latLonOf(track, x, z) {
    const { origin, metresPerDegree } = track.stage.route;
    const b = track.bearing * DEG;
    const dx = x * Math.cos(b) - z * Math.sin(b);
    const dy = -x * Math.sin(b) - z * Math.cos(b);
    return [
        origin[0] + (dy + track.routeOrigin[1]) / metresPerDegree[1],
        origin[1] + (dx + track.routeOrigin[0]) / metresPerDegree[0],
    ];
}

/** Where world point (x, z) falls on the picture of the route's surroundings: [u, v] (0..1). */
export function landUv(track, x, z) {
    const { south, north, west, east } = track.stage.route.surroundings;
    const [lat, lon] = latLonOf(track, x, z);
    return [(lon - west) / (east - west), (lat - south) / (north - south)];
}
