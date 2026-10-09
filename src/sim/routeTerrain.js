import { clamp, lerp } from '../util/math.js';

/** Each route's roadside sections, decoded from base64 once. */
const decoded = new WeakMap();

function roadsideSections(route) {
    if (!decoded.has(route)) {
        const bytes = Uint8Array.from(atob(route.roadside), (c) => { return c.charCodeAt(0); });
        decoded.set(route, new Int16Array(bytes.buffer));
    }
    return decoded.get(route);
}

/** Where track node `i` (with `routeStart`) falls between the route's rows taken every `step` nodes:
 *  [row, fraction to the next]. */
function rowAt(track, i, step, rows) {
    const at = clamp((track.routeStart + i) / step, 0, rows - 1.0001);
    const row = Math.floor(at);
    return [row, at - row];
}

/** The real roadside at track node `i` of `track` (a Track, or its builder): `out` m beyond the edge
 *  of the road on `side` (-1 left, 1 right), in m above the road, between the route's sections. */
export function roadsideAt(track, i, side, out) {
    const route = track.stage.route;
    const data = roadsideSections(route);
    const across = route.nearReach / route.nearSpacing + 1;
    const [row, f] = rowAt(track, i, route.nearStep, data.length / (2 * across));
    const k = clamp(out / route.nearSpacing, 0, across - 1.0001);
    const c = Math.floor(k);
    const start = side < 0 ? 0 : across;
    const height = (r) => {
        const at = r * 2 * across + start + c;
        return lerp(data[at], data[at + 1], k - c) / 10;
    };
    return lerp(height(row), height(row + 1), f);
}

/** The real ground across the route at track node `i`, lateral offset `u`, in m above the sea: bilinear
 *  between the route's cross-sections, held at the nearest and furthest offsets on that side. */
export function routeGround(track, i, u) {
    const { sectionStep, sectionOffsets: offsets, sections } = track.stage.route;
    const [row, f] = rowAt(track, i, sectionStep, sections.length / offsets.length);
    const right = offsets.findIndex((offset) => { return offset > 0; });
    const [first, last] = u < 0 ? [0, right - 1] : [right, offsets.length - 1];
    const across = clamp(u, offsets[first], offsets[last]);
    let c = first;
    while (c < last - 1 && across > offsets[c + 1]) c++;
    const fu = (across - offsets[c]) / (offsets[c + 1] - offsets[c]);
    const height = (r) => {
        return lerp(sections[r * offsets.length + c], sections[r * offsets.length + c + 1], fu);
    };
    return lerp(height(row), height(row + 1), f);
}
