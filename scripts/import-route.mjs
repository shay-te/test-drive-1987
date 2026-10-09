/** Imports the real Sea-to-Sky Highway (BC 99) northbound, from the Horseshoe Bay interchange to
 *  Squamish, into src/data/seaToSky.js: the road's curvature and elevation every ROAD.segment metres,
 *  the roadside in fine cross-sections and the terrain across it. Road: OpenStreetMap (ODbL); heights:
 *  LidarBC's 1 m bare earth (Open Government Licence - British Columbia), and beyond it the Mapzen/AWS
 *  terrain tiles, which carry Natural Resources Canada's CDEM here (Open Government Licence - Canada).
 *  Usage: node scripts/import-route.mjs (downloads, about 600 MB, are cached in tmp/route-cache) */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fromFile } from 'geotiff';
import sharp from 'sharp';
import { ROAD } from '../src/config.js';
import { SURROUNDINGS, SURROUNDINGS_HEIGHTS, SURROUNDINGS_IMAGE, toUtm } from './geo.mjs';
import { CACHE, ROUTE_BOX, HIGHWAY, download, overpass } from './sources.mjs';

const OUTPUT = 'src/data/seaToSky.js';
/** The northbound on-ramp at the Horseshoe Bay interchange (lat, lon). */
const START = [49.3680405, -123.271019];
const EARTH = 6371000;
const TILE_ZOOM = 13;
/** The distant land is sampled every SURROUNDINGS_STEP m, from coarser tiles. */
const SURROUNDINGS_ZOOM = 12;
const SURROUNDINGS_STEP = 180;
const TILE_SIZE = 256;
const TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
/** Smoothing of the mapped centreline and of the road's height (m, Gaussian sigma). */
const LINE_SIGMA = 24;
const GRADE_SIGMA = 8;
/** A median over this many nodes drops a stray height (the mapped line crossing the road's edge), and
 *  nothing is left steeper than the steepest grade the highway has. */
const GRADE_MEDIAN = 7;
const MAX_GRADE = 0.09;
/** LidarBC's 1 m bare-earth tiles along the route (BCGS sheets of 092G), the newest survey first. */
const LIDAR = 'https://nrs.objectstore.gov.bc.ca/gdwuts/092/092g';
const LIDAR_TILES = [
    '2019/dem/bc_092g034_xl1m_utm10_2019.tif',
    '2019/dem/bc_092g044_xl1m_utm10_2019.tif',
    '2019/dem/bc_092g054_xl1m_utm10_2019.tif',
    '2019/dem/bc_092g064_xl1m_utm10_2019.tif',
    '2019/dem/bc_092g065_xl1m_utm10_2019.tif',
    '2016/dem/bc_092g034_xl1m_utm10_170713.tif',
    '2016/dem/bc_092g065_xl1m_utm10_170601.tif',
    '2016/dem/bc_092g075_xl1m_utm10_170601.tif',
];
const LIDAR_BLOCK = 512;
const LIDAR_BLOCKS_KEPT = 64;
/** Bare earth has no bridge decks: the road is carried straight across, from this far before to this
 *  far after each mapped bridge (m). */
const BRIDGE_MARGIN = 12;
/** The roadside in fine cross-sections every NEAR_STEP nodes: from the edge of the real road's flat
 *  platform (today four lanes, where the game's road has two) out NEAR_REACH m on each side, NEAR_SPACING
 *  m apart, in decimetres above (or below) the road. The platform ends where the ground strays more than
 *  PLATFORM_RISE m from the road, sought 1 m at a time out to PLATFORM_REACH m. */
const NEAR_STEP = 3;
const NEAR_SPACING = 3;
const NEAR_REACH = 57;
const PLATFORM_RISE = 1.5;
const PLATFORM_REACH = 40;
/** Terrain across the road every SECTION_STEP nodes, at these lateral offsets (m, + right). */
const SECTION_STEP = 10;
const SECTION_OFFSETS = [-2400, -1700, -1200, -850, -600, -420, -300, -210, -150, -105, -75,
    75, 105, 150, 210, 300, 420, 600, 850, 1200, 1700, 2400];

const seg = ROAD.segment;

/** BC 99's carriageways from OpenStreetMap. */
function highwayWays() {
    return overpass(`[out:json][timeout:120];${HIGHWAY}.hwy out geom tags;`, 'bc99.json');
}

/** The shortest legal drive north from START through the directed carriageways: its points as
 *  [lat, lon], and for each step between them whether it is on a bridge. */
function northbound(ways) {
    const id = ({ lat, lon }) => { return `${lat.toFixed(7)},${lon.toFixed(7)}`; };
    const points = new Map();
    const next = new Map();
    const bridges = new Set();
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
        const bridge = Boolean(way.tags.bridge) && way.tags.bridge !== 'no';
        for (let i = 1; i < ids.length; i++) {
            link(ids[i - 1], ids[i]);
            if (!oneway) link(ids[i], ids[i - 1]);
            if (bridge) bridges.add(`${ids[i - 1]}>${ids[i]}`).add(`${ids[i]}>${ids[i - 1]}`);
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
    path.reverse();
    return {
        points: path.map((node) => { return points.get(node); }),
        bridge: path.slice(1).map((node, i) => { return bridges.has(`${path[i]}>${node}`); }),
    };
}

/** Where the bridges are along `route` (from northbound), as [from, to] metres along it. */
function bridgeSpans(route) {
    const spans = [];
    let along = 0;
    route.bridge.forEach((onBridge, i) => {
        const length = metres(route.points[i], route.points[i + 1]);
        if (onBridge) {
            const last = spans.at(-1);
            if (last && last[1] === along) last[1] += length;
            else spans.push([along, along + length]);
        }
        along += length;
    });
    return spans;
}

/** Heights every `seg` m with each bridge `span` (m along) bridged: straight from one end to the other. */
function bridged(heights, spans) {
    const out = [...heights];
    for (const [from, to] of spans) {
        const a = Math.max(0, Math.floor((from - BRIDGE_MARGIN) / seg));
        const b = Math.min(out.length - 1, Math.ceil((to + BRIDGE_MARGIN) / seg));
        for (let i = a + 1; i < b; i++) out[i] = out[a] + ((out[b] - out[a]) * (i - a)) / (b - a);
    }
    return out;
}

/** LidarBC's bare earth at [lat, lon] (m above the sea), bilinear between its 1 m pixels, read block by
 *  block from the cached tiles; null where no tile has data. */
async function lidar() {
    const tiles = [];
    for (const path of LIDAR_TILES) {
        const file = path.split('/').at(-1);
        await download(`${LIDAR}/${path}`, file);
        const image = await (await fromFile(`${CACHE}/${file}`)).getImage();
        const [x0, y0] = image.getOrigin();
        const [rx, ry] = image.getResolution();
        tiles.push({ image, x0, y0, rx, ry, width: image.getWidth(), height: image.getHeight(), blocks: new Map() });
    }
    const pixel = async (tile, px, py) => {
        if (px < 0 || py < 0 || px >= tile.width || py >= tile.height) return null;
        const [bx, by] = [Math.floor(px / LIDAR_BLOCK), Math.floor(py / LIDAR_BLOCK)];
        const key = `${bx},${by}`;
        if (!tile.blocks.has(key)) {
            const window = [bx * LIDAR_BLOCK, by * LIDAR_BLOCK, Math.min(tile.width, (bx + 1) * LIDAR_BLOCK), Math.min(tile.height, (by + 1) * LIDAR_BLOCK)];
            const [data] = await tile.image.readRasters({ window });
            tile.blocks.set(key, { data, width: window[2] - window[0] });
            if (tile.blocks.size > LIDAR_BLOCKS_KEPT) tile.blocks.delete(tile.blocks.keys().next().value);
        }
        const block = tile.blocks.get(key);
        const value = block.data[(py % LIDAR_BLOCK) * block.width + (px % LIDAR_BLOCK)];
        // Both nodata markers (-9999, -32767) lie far below any ground here.
        return value < -1000 ? null : value;
    };
    return async (point) => {
        const [east, north] = toUtm(point);
        for (const tile of tiles) {
            const px = (east - tile.x0) / tile.rx - 0.5;
            const py = (north - tile.y0) / tile.ry - 0.5;
            const [ix, iy] = [Math.floor(px), Math.floor(py)];
            const [fx, fy] = [px - ix, py - iy];
            const q = [await pixel(tile, ix, iy), await pixel(tile, ix + 1, iy), await pixel(tile, ix, iy + 1), await pixel(tile, ix + 1, iy + 1)];
            if (q.includes(null)) continue;
            return (q[0] * (1 - fx) + q[1] * fx) * (1 - fy) + (q[2] * (1 - fx) + q[3] * fx) * fy;
        }
        return null;
    };
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

/** Terrain height (m above sea level) anywhere in `box` ([south, west, north, east]), bilinear between
 *  the pixels of the tiles at `zoom`. */
async function terrain(box, zoom) {
    const n = 2 ** zoom;
    const toPixel = ([lat, lon]) => {
        const k = Math.PI / 180;
        return [((lon + 180) / 360) * n * TILE_SIZE, ((1 - Math.asinh(Math.tan(lat * k)) / Math.PI) / 2) * n * TILE_SIZE];
    };
    const margin = 0.04;
    const [x0, y0] = toPixel([box[2] + margin, box[1] - margin]).map((p) => { return Math.floor(p / TILE_SIZE); });
    const [x1, y1] = toPixel([box[0] - margin, box[3] + margin]).map((p) => { return Math.floor(p / TILE_SIZE); });
    const tiles = new Map();
    for (let tx = x0; tx <= x1; tx++) {
        for (let ty = y0; ty <= y1; ty++) {
            const png = await download(`${TILES}/${zoom}/${tx}/${ty}.png`, `terrarium-${zoom}-${tx}-${ty}.png`);
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

/** `values` as base64 of little-endian 16-bit integers, in lines of `width` characters. */
function packed(values, width = 112) {
    const text = Buffer.from(Int16Array.from(values).buffer).toString('base64');
    const lines = [];
    for (let i = 0; i < text.length; i += width) lines.push(`        '${text.slice(i, i + width)}',`);
    return lines.join('\n');
}

const route = northbound(await highwayWays());
const projected = route.points.map(project);
const line = resample(smooth(resample(projected, seg), LINE_SIGMA / seg), seg);
const { heading, curvature } = curvatureOf(line);
const terrainAt = await terrain(ROUTE_BOX, TILE_ZOOM);
const lidarAt = await lidar();
let fromLidar = 0;
let samples = 0;
/** The ground at a local point [east, north]: LiDAR where it has it, else the terrain tiles. */
const groundAt = async (p) => {
    const point = unproject(p);
    const fine = await lidarAt(point);
    samples++;
    if (fine === null) return terrainAt(point);
    fromLidar++;
    return fine;
};
const mapped = projected.slice(1).reduce((sum, p, i) => { return sum + Math.hypot(p[0] - projected[i][0], p[1] - projected[i][1]); }, 0);
const spans = bridgeSpans(route).map(([from, to]) => { return [(from * (line.length - 1) * seg) / mapped, (to * (line.length - 1) * seg) / mapped]; });
const ground = [];
for (const p of line) ground.push(await groundAt(p));
const elevation = smooth(limitGrade(median(bridged(ground, spans), GRADE_MEDIAN), MAX_GRADE), GRADE_SIGMA / seg);
const at = (i, u) => {
    const right = [Math.cos(heading[i]), -Math.sin(heading[i])];
    return groundAt([line[i][0] + right[0] * u, line[i][1] + right[1] * u]);
};
const sections = [];
for (let i = 0; i < line.length; i += SECTION_STEP) for (const u of SECTION_OFFSETS) sections.push(await at(i, u));
const roadside = [];
const platform = [];
for (let i = 0; i < line.length; i += NEAR_STEP) {
    const rise = async (u) => { return (await at(i, u)) - elevation[i]; };
    for (const side of [-1, 1]) {
        let edge = 0;
        while (edge < PLATFORM_REACH && Math.abs(await rise(side * (edge + 1))) < PLATFORM_RISE) edge++;
        edge = Math.max(edge, ROAD.halfWidth);
        platform.push(edge);
        for (let out = 0; out <= NEAR_REACH; out += NEAR_SPACING) roadside.push(Math.round((await rise(side * (edge + out))) * 10));
    }
}
/** The land around the route, every SURROUNDINGS_STEP m over SURROUNDINGS, north row first, as 16-bit
 *  metres above the sea. */
const distantAt = await terrain([SURROUNDINGS.south, SURROUNDINGS.west, SURROUNDINGS.north, SURROUNDINGS.east], SURROUNDINGS_ZOOM);
const degree = Math.PI / 180;
const metresPerDegree = [EARTH * Math.cos(START[0] * degree) * degree, EARTH * degree];
const rows = Math.round(((SURROUNDINGS.north - SURROUNDINGS.south) * metresPerDegree[1]) / SURROUNDINGS_STEP) + 1;
const columns = Math.round(((SURROUNDINGS.east - SURROUNDINGS.west) * metresPerDegree[0]) / SURROUNDINGS_STEP) + 1;
const distant = new Int16Array(rows * columns);
for (let row = 0; row < rows; row++) {
    const lat = SURROUNDINGS.north - (row / (rows - 1)) * (SURROUNDINGS.north - SURROUNDINGS.south);
    for (let col = 0; col < columns; col++) {
        distant[row * columns + col] = Math.round(distantAt([lat, SURROUNDINGS.west + (col / (columns - 1)) * (SURROUNDINGS.east - SURROUNDINGS.west)]));
    }
}
mkdirSync(SURROUNDINGS_HEIGHTS.split('/').slice(0, -1).join('/'), { recursive: true });
writeFileSync(SURROUNDINGS_HEIGHTS, Buffer.from(distant.buffer));
const length = (line.length - 1) * seg;
console.info(`[route] ${route.points.length} mapped points, ${(length / 1000).toFixed(2)} km, ${line.length} nodes, `
    + `${spans.length} bridges; integration drift ${drift(line, heading, curvature).toFixed(2)} m; road `
    + `${Math.min(...elevation).toFixed(0)}..${Math.max(...elevation).toFixed(0)} m above the sea; `
    + `${((100 * fromLidar) / samples).toFixed(1)}% of heights from LiDAR; the real road's flat reaches typically `
    + `${[...platform].sort((x, y) => { return x - y; })[platform.length >> 1]} m to either side of the line; `
    + `the land around ${columns}x${rows} heights`);
writeFileSync(OUTPUT, `/** The Sea-to-Sky Highway (BC 99) northbound, from the Horseshoe Bay interchange to Squamish, every
 *  ROAD.segment m: curvature (rad/m, + right) and height above the sea (m); the roadside every \`nearStep\`
 *  nodes, left then right, from the edge of the real road out \`nearReach\` m every \`nearSpacing\` m, as
 *  base64 16-bit decimetres above the road; and the terrain across the road every \`sectionStep\` nodes at
 *  \`sectionOffsets\` (m above the sea). \`bearingDeg\`: the start's compass heading. Generated by
 *  scripts/import-route.mjs.
 *  Road: (c) OpenStreetMap contributors (ODbL). Heights: contains information licensed under the Open
 *  Government Licence - British Columbia (LidarBC); Natural Resources Canada CDEM (Open Government
 *  Licence - Canada) via the Mapzen/AWS terrain tiles. */
export const SEA_TO_SKY = {
    bearingDeg: ${((heading[0] * 180) / Math.PI).toFixed(2)},
    // Where the route lies on the map: local metres east and north of \`origin\` (lat, lon), with
    // \`metresPerDegree\` of longitude and latitude; \`start\` is its first node there.
    origin: [${START.join(', ')}],
    metresPerDegree: [${metresPerDegree.map((m) => { return m.toFixed(3); }).join(', ')}],
    start: [${line[0].map((m) => { return m.toFixed(2); }).join(', ')}],
    // The land around it to the horizon: heights every few hundred metres, north row first (16-bit metres
    // above the sea), and its colour as Landsat 5 saw it on 5 September 1987, both over the same box.
    surroundings: {
        south: ${SURROUNDINGS.south}, north: ${SURROUNDINGS.north}, west: ${SURROUNDINGS.west}, east: ${SURROUNDINGS.east},
        rows: ${rows}, columns: ${columns},
        heights: '${SURROUNDINGS_HEIGHTS}',
        image: '${SURROUNDINGS_IMAGE}',
    },
    curvature: [
${list(curvature, 6)}
    ],
    elevation: [
${list(elevation, 2)}
    ],
    nearStep: ${NEAR_STEP},
    nearSpacing: ${NEAR_SPACING},
    nearReach: ${NEAR_REACH},
    roadside: [
${packed(roadside)}
    ].join(''),
    sectionStep: ${SECTION_STEP},
    sectionOffsets: [${SECTION_OFFSETS.join(', ')}],
    sections: [
${list(sections, 0)}
    ],
};
`);
console.info(`[route] wrote ${OUTPUT}`);
