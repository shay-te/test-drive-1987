/** Map projections shared by the import scripts. */

/** Points [[lat, lon], ...] packed as the route's data keeps them (src/world/routeFrame.js unpacks
 *  them): microdegrees, the first point whole and each next one as a step from the last. */
export function packMicro(points) {
    const micro = points.map(([lat, lon]) => { return [Math.round(lat * 1e6), Math.round(lon * 1e6)]; });
    return micro.flatMap((point, i) => {
        return i === 0 ? point : [point[0] - micro[i - 1][0], point[1] - micro[i - 1][1]];
    });
}

/** [easting, northing] in UTM zone 10 (GRS80) of [lat, lon]. */
export function toUtm([lat, lon]) {
    const k = Math.PI / 180;
    const a = 6378137;
    const f = 1 / 298.257222101;
    const k0 = 0.9996;
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const phi = lat * k;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2;
    const C = ep2 * Math.cos(phi) ** 2;
    const A = Math.cos(phi) * (lon + 123) * k;
    const M = a * ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi
        - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
        + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
        - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
    const east = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
    const north = k0 * (M + N * Math.tan(phi) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
        + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
    return [east, north];
}

/** The land drawn around the Sea-to-Sky route, out to the horizon: Howe Sound, its islands and the
 *  Coast Mountains either side, Garibaldi to the north (degrees). */
export const SURROUNDINGS = { south: 49.25, north: 49.9, west: -123.7, east: -122.8 };
/** The land's colour over SURROUNDINGS (scripts/import-landsat.mjs) and its heights (import-route.mjs). */
export const SURROUNDINGS_IMAGE = 'assets/terrain/sea-to-sky/landsat-1987-09-05.jpg';
export const SURROUNDINGS_HEIGHTS = 'assets/terrain/sea-to-sky/heights.bin';
