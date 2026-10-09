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
