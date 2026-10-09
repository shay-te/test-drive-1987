/** Imports the real Sea-to-Sky Highway (BC 99) northbound, from the Horseshoe Bay interchange to
 *  Squamish, into src/data/seaToSky.js: the road's curvature and elevation every ROAD.segment metres,
 *  and the terrain across it. Road: OpenStreetMap (ODbL); heights: Mapzen/AWS terrain tiles, which
 *  carry Natural Resources Canada's CDEM here (Open Government Licence - Canada).
 *  Usage: node scripts/import-route.mjs (downloads are cached in tmp/route-cache) */
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ROAD } from '../src/config.js';

const CACHE = 'tmp/route-cache';
const OUTPUT = 'src/data/seaToSky.js';
const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'test-drive-1987-route-import/1.0 (https://github.com/shay-te/test-drive-1987)';
/** South, west, north, east: Horseshoe Bay to past Squamish. */
const BOX = [49.355, -123.32, 49.77, -123.08];
/** The northbound on-ramp at the Horseshoe Bay interchange (lat, lon). */
const START = [49.3680405, -123.271019];
const EARTH = 6371000;
const TILE_ZOOM = 13;
const TILE_SIZE = 256;
const TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
/** Smoothing of the mapped centreline and of the road's height (m, Gaussian sigma). */
const LINE_SIGMA = 24;
const GRADE_SIGMA = 36;
/** The terrain heights straddle the road's cut and fill: a median over this many nodes ignores them;
 *  bridges and cuttings beyond that are levelled to the steepest grade the highway has. */
const GRADE_MEDIAN = 51;
const MAX_GRADE = 0.09;
/** Terrain across the road every SECTION_STEP nodes, at these lateral offsets (m, + right). */
const SECTION_STEP = 10;
const SECTION_OFFSETS = [-2400, -1700, -1200, -850, -600, -420, -300, -210, -150, -105, -75,
    75, 105, 150, 210, 300, 420, 600, 850, 1200, 1700, 2400];

const seg = ROAD.segment;

/** `url`'s body, cached in `file`; `check` throws on a body that must not be kept (a server's error page). */
async function download(url, file, options = {}, check = () => {}) {
    const path = `${CACHE}/${file}`;
    if (existsSync(path)) return readFileSync(path);
    const response = await fetch(url, { ...options, headers: { 'User-Agent': USER_AGENT, ...options.headers } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    check(bytes);
    writeFileSync(path, bytes);
    return bytes;
}

/** BC 99's carriageways from OpenStreetMap, trying each Overpass server in turn. */
async function highwayWays() {
    const [s, w, n, e] = BOX;
    const query = `[out:json][timeout:120];way["ref"="BC 99"]["highway"~"^(motorway|trunk)$"](${s},${w},${n},${e});out geom tags;`;
    for (const server of OVERPASS) {
        try {
            const bytes = await download(server, 'bc99.json', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
            }, (body) => { JSON.parse(body.toString('utf8')); });
            return JSON.parse(bytes.toString('utf8')).elements;
        } catch (error) {
            console.warn(`[route] ${server} failed (${error.message}); trying the next server`);
        }
    }
    throw new Error('No Overpass server answered');
}

/** The shortest legal drive north from START through the directed carriageways, as [lat, lon]. */
function northbound(ways) {
    const id = ({ lat, lon }) => { return `${lat.toFixed(7)},${lon.toFixed(7)}`; };
    const points = new Map();
    const next = new Map();
    const link = (a, b) => {
        if (!next.has(a)) next.set(a, []);
        next.get(a).push(b);
    };
    for (const way of ways) {
        const ids = way.geometry.map((p) => {
            points.set(id(p), [p.lat, p.lon]);
            return id(p);
        });
        const oneway = way.tags.oneway === 'yes' || way.tags.highway === 'motorway';
        for (let i = 1; i < ids.length; i++) {
            link(ids[i - 1], ids[i]);
            if (!oneway) link(ids[i], ids[i - 1]);
        }
    }
    const start = id({ lat: START[0], lon: START[1] });
    if (!points.has(start)) throw new Error('The start point is not on the mapped highway');
    const cost = new Map([[start, 0]]);
    const previous = new Map();
    const open = new Set([start]);
    while (open.size) {
        let at = null;
        for (const node of open) if (at === null || cost.get(node) < cost.get(at)) at = node;
        open.delete(at);
        for (const to of next.get(at) ?? []) {
            const c = cost.get(at) + metres(points.get(at), points.get(to));
            if (c < (cost.get(to) ?? Infinity)) {
                cost.set(to, c);
                previous.set(to, at);
                open.add(to);
            }
        }
    }
    let end = start;
    for (const node of cost.keys()) if (points.get(node)[0] > points.get(end)[0]) end = node;
    const path = [end];
    while (path.at(-1) !== start) path.push(previous.get(path.at(-1)));
    return path.reverse().map((node) => { return points.get(node); });
}

/** Local metres east and north of START. */
function project([lat, lon]) {
    const k = Math.PI / 180;
    return [EARTH * Math.cos(START[0] * k) * (lon - START[1]) * k, EARTH * (lat - START[0]) * k];
}

function unproject([east, north]) {
    const k = Math.PI / 180;
    return [START[0] + north / EARTH / k, START[1] + east / (EARTH * Math.cos(START[0] * k)) / k];
}

function metres(a, b) {
    const [e1, n1] = project(a);
    const [e2, n2] = project(b);
    return Math.hypot(e2 - e1, n2 - n1);
}

/** Points every `step` metres along a polyline. */
function resample(line, step) {
    const out = [line[0]];
    let carry = 0;
    for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1], line[i]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let t = step - carry;
        while (t <= length) {
            out.push([a[0] + ((b[0] - a[0]) * t) / length, a[1] + ((b[1] - a[1]) * t) / length]);
            t += step;
        }
        carry = (carry + length) % step;
    }
    return out;
}

/** Gaussian smoothing of a list of numbers (or of each coordinate of points), ends held. */
function smooth(values, sigma) {
    const radius = Math.ceil(sigma * 3);
    const weights = Array.from({ length: 2 * radius + 1 }, (_, j) => { return Math.exp(-((j - radius) ** 2) / (2 * sigma * sigma)); });
    const total = weights.reduce((a, b) => { return a + b; });
    const pick = (i) => { return values[Math.min(values.length - 1, Math.max(0, i))]; };
    return values.map((_, i) => {
        let sum = Array.isArray(values[0]) ? values[0].map(() => { return 0; }) : 0;
        for (let j = -radius; j <= radius; j++) {
            const w = weights[j + radius] / total;
            const v = pick(i + j);
            sum = Array.isArray(v) ? sum.map((s, c) => { return s + v[c] * w; }) : sum + v * w;
        }
        return sum;
    });
}

function median(values, window) {
    const half = Math.floor(window / 2);
    return values.map((_, i) => {
        const near = values.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => { return a - b; });
        return near[Math.floor(near.length / 2)];
    });
}

/** `values` (heights every `seg` m) eased until no grade is steeper than `max`. */
function limitGrade(values, max) {
    const rise = max * seg;
    let heights = values;
    for (let pass = 0; pass < 50; pass++) {
        const forward = [...heights];
        for (let i = 1; i < forward.length; i++) forward[i] = Math.min(Math.max(forward[i], forward[i - 1] - rise), forward[i - 1] + rise);
        const backward = [...heights];
        for (let i = backward.length - 2; i >= 0; i--) backward[i] = Math.min(Math.max(backward[i], backward[i + 1] - rise), backward[i + 1] + rise);
        heights = forward.map((h, i) => { return (h + backward[i]) / 2; });
    }
    for (let i = 1; i < heights.length; i++) heights[i] = Math.min(Math.max(heights[i], heights[i - 1] - rise), heights[i - 1] + rise);
    return heights;
}

/** Terrain height (m above sea level) anywhere in BOX, bilinear between tile pixels. */
async function terrain() {
    const n = 2 ** TILE_ZOOM;
    const toPixel = ([lat, lon]) => {
        const k = Math.PI / 180;
        return [((lon + 180) / 360) * n * TILE_SIZE, ((1 - Math.asinh(Math.tan(lat * k)) / Math.PI) / 2) * n * TILE_SIZE];
    };
    const margin = 0.04;
    const [x0, y0] = toPixel([BOX[2] + margin, BOX[1] - margin]).map((p) => { return Math.floor(p / TILE_SIZE); });
    const [x1, y1] = toPixel([BOX[0] - margin, BOX[3] + margin]).map((p) => { return Math.floor(p / TILE_SIZE); });
    const tiles = new Map();
    for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
            const png = await download(`${TILES}/${TILE_ZOOM}/${tx}/${ty}.png`, `terrarium-${TILE_ZOOM}-${tx}-${ty}.png`);
            const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
            const heights = new Float32Array(TILE_SIZE * TILE_SIZE);
            for (let i = 0; i < heights.length; i++) {
                heights[i] = data[i * info.channels] * 256 + data[i * info.channels + 1] + data[i * info.channels + 2] / 256 - 32768;
            }
            tiles.set(`${tx},${ty}`, heights);
        }
    }
    const pixel = (px, py) => {
        const tile = tiles.get(`${Math.floor(px / TILE_SIZE)},${Math.floor(py / TILE_SIZE)}`);
        if (!tile) throw new Error('Terrain sampled outside the downloaded tiles');
        return tile[(py % TILE_SIZE) * TILE_SIZE + (px % TILE_SIZE)];
    };
    return (point) => {
        const [px, py] = toPixel(point).map((p) => { return p - 0.5; });
        const [ix, iy] = [Math.floor(px), Math.floor(py)];
        const [fx, fy] = [px - ix, py - iy];
        const top = pixel(ix, iy) * (1 - fx) + pixel(ix + 1, iy) * fx;
        const bottom = pixel(ix, iy + 1) * (1 - fx) + pixel(ix + 1, iy + 1) * fx;
        return top * (1 - fy) + bottom * fy;
    };
}

/** Headings (bearing, rad) at nodes and the curvature (rad/m) that Track integrates back into them. */
function curvatureOf(line) {
    const chords = [];
    for (let i = 1; i < line.length; i++) chords.push(Math.atan2(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    for (let i = 1; i < chords.length; i++) chords[i] = chords[i - 1] + Math.atan2(Math.sin(chords[i] - chords[i - 1]), Math.cos(chords[i] - chords[i - 1]));
    const heading = line.map((_, i) => {
        if (i === 0) return chords[0];
        if (i === line.length - 1) return chords.at(-1);
        return (chords[i - 1] + chords[i]) / 2;
    });
    return { heading, curvature: heading.map((h, i) => { return i + 1 < heading.length ? (heading[i + 1] - h) / seg : 0; }) };
}

/** How far Track's integration of `curvature` strays from the mapped line (m). */
function drift(line, heading, curvature) {
    let [x, y] = line[0];
    let psi = heading[0];
    let worst = 0;
    for (let i = 0; i < line.length; i++) {
        worst = Math.max(worst, Math.hypot(x - line[i][0], y - line[i][1]));
        const mid = psi + (curvature[i] * seg) / 2;
        x += Math.sin(mid) * seg;
        y += Math.cos(mid) * seg;
        psi += curvature[i] * seg;
    }
    return worst;
}

function list(values, digits) {
    const items = values.map((v) => { return Number(v.toFixed(digits)); });
    const lines = [];
    for (let i = 0; i < items.length; i += 16) lines.push(`        ${items.slice(i, i + 16).join(', ')},`);
    return lines.join('\n');
}

mkdirSync(CACHE, { recursive: true });
const route = northbound(await highwayWays());
const line = resample(smooth(resample(route.map(project), seg), LINE_SIGMA / seg), seg);
const { heading, curvature } = curvatureOf(line);
const heightAt = await terrain();
const ground = line.map((p) => { return heightAt(unproject(p)); });
const elevation = smooth(limitGrade(median(ground, GRADE_MEDIAN), MAX_GRADE), GRADE_SIGMA / seg);
const sections = [];
for (let i = 0; i < line.length; i += SECTION_STEP) {
    const right = [Math.cos(heading[i]), -Math.sin(heading[i])];
    for (const u of SECTION_OFFSETS) sections.push(heightAt(unproject([line[i][0] + right[0] * u, line[i][1] + right[1] * u])));
}
const length = (line.length - 1) * seg;
console.info(`[route] ${route.length} mapped points, ${(length / 1000).toFixed(2)} km, ${line.length} nodes; `
    + `integration drift ${drift(line, heading, curvature).toFixed(2)} m; road ${Math.min(...elevation).toFixed(0)}`
    + `..${Math.max(...elevation).toFixed(0)} m above the sea`);
writeFileSync(OUTPUT, `/** The Sea-to-Sky Highway (BC 99) northbound, from the Horseshoe Bay interchange to Squamish, every
 *  ROAD.segment m: curvature (rad/m, + right) and height above the sea (m), and the terrain across the road
 *  every \`sectionStep\` nodes at \`sectionOffsets\` (m, + right). \`bearingDeg\`: the start's compass heading.
 *  Generated by scripts/import-route.mjs. Road: (c) OpenStreetMap contributors (ODbL); heights: Natural
 *  Resources Canada CDEM (Open Government Licence - Canada) via the Mapzen/AWS terrain tiles. */
export const SEA_TO_SKY = {
    bearingDeg: ${((heading[0] * 180) / Math.PI).toFixed(2)},
    curvature: [
${list(curvature, 6)}
    ],
    elevation: [
${list(elevation, 2)}
    ],
    sectionStep: ${SECTION_STEP},
    sectionOffsets: [${SECTION_OFFSETS.join(', ')}],
    sections: [
${list(sections, 0)}
    ],
};
`);
console.info(`[route] wrote ${OUTPUT}`);
