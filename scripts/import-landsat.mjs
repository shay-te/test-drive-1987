/** Imports the colour of the land around the Sea-to-Sky route as Landsat 5 saw it on 5 September 1987
 *  (USGS/NASA, public domain; Collection 2 surface reflectance, read from Microsoft's Planetary
 *  Computer): one JPEG over SURROUNDINGS, a lat/lon grid, from path 47 rows 26 and 25, and the far
 *  west corner from the pass of 10 July 1987 (path 48). Usage: node scripts/import-landsat.mjs */
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { fromUrl } from 'geotiff';
import sharp from 'sharp';
import { SURROUNDINGS, SURROUNDINGS_IMAGE as OUTPUT, toUtm } from './geo.mjs';

const TOKEN = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2';
const ARCHIVE = 'https://landsateuwest.blob.core.windows.net/landsat-c2/level-2/standard/tm/1987';
/** The frames, the one over the route first; bands red, green, blue (TM 3, 2, 1) and pixel quality. */
const SCENES = [
    '047/026/LT05_L2SP_047026_19870905_20201015_02_T1',
    '047/025/LT05_L2SP_047025_19870905_20201014_02_T1',
    '048/026/LT05_L2SP_048026_19870710_20201014_02_T1',
];
const BANDS = ['SR_B3', 'SR_B2', 'SR_B1', 'QA_PIXEL'];
/** Output size, and Collection 2's reflectance scaling. */
const SIZE = 2048;
const SCALE = 0.0000275;
const OFFSET = -0.2;
/** Pixel quality bits: no data; and cloud or cloud shadow, which here are mostly snow, glaciers and the
 *  shade of north faces (the passes were clear), so they are used where nothing else is. */
const FILL = 1 << 0;
const DOUBTFUL = (1 << 3) | (1 << 4);
/** How reflectance becomes a picture: brighten, then sRGB gamma with a little contrast. */
const GAIN = 3.4;
const GAMMA = 1 / 2.2;
const QUALITY = 85;

const token = (await (await fetch(TOKEN)).json()).token;
const corners = [
    [SURROUNDINGS.south, SURROUNDINGS.west], [SURROUNDINGS.south, SURROUNDINGS.east],
    [SURROUNDINGS.north, SURROUNDINGS.west], [SURROUNDINGS.north, SURROUNDINGS.east],
].map(toUtm);
const frames = [];
for (const scene of SCENES) {
    const bands = [];
    let window = null;
    let geometry = null;
    for (const band of BANDS) {
        const name = scene.split('/').at(-1);
        const image = await (await fromUrl(`${ARCHIVE}/${scene}/${name}_${band}.TIF?${token}`)).getImage();
        if (!geometry) {
            const [x0, y0] = image.getOrigin();
            const [rx, ry] = image.getResolution();
            const px = corners.map(([e]) => { return (e - x0) / rx; });
            const py = corners.map(([, n]) => { return (n - y0) / ry; });
            window = [
                Math.max(0, Math.floor(Math.min(...px)) - 2), Math.max(0, Math.floor(Math.min(...py)) - 2),
                Math.min(image.getWidth(), Math.ceil(Math.max(...px)) + 2), Math.min(image.getHeight(), Math.ceil(Math.max(...py)) + 2),
            ];
            geometry = { x0, y0, rx, ry, window, width: window[2] - window[0], height: window[3] - window[1] };
        }
        const [data] = await image.readRasters({ window });
        bands.push(data);
        console.info(`[landsat] ${name} ${band}: ${geometry.width}x${geometry.height}`);
    }
    frames.push({ ...geometry, bands });
}

/** Reflectance of the three colours at UTM (east, north) in `frame`, or null where it has no pixel, or
 *  only `unusable` ones. */
function colourAt(frame, east, north, unusable) {
    const px = (east - frame.x0) / frame.rx - frame.window[0] - 0.5;
    const py = (north - frame.y0) / frame.ry - frame.window[1] - 0.5;
    const [ix, iy] = [Math.floor(px), Math.floor(py)];
    if (ix < 0 || iy < 0 || ix + 1 >= frame.width || iy + 1 >= frame.height) return null;
    const [fx, fy] = [px - ix, py - iy];
    const at = [iy * frame.width + ix, iy * frame.width + ix + 1, (iy + 1) * frame.width + ix, (iy + 1) * frame.width + ix + 1];
    if (at.some((k) => { return frame.bands[3][k] & unusable; })) return null;
    return [0, 1, 2].map((b) => {
        const v = frame.bands[b];
        const dn = (v[at[0]] * (1 - fx) + v[at[1]] * fx) * (1 - fy) + (v[at[2]] * (1 - fx) + v[at[3]] * fx) * fy;
        return dn * SCALE + OFFSET;
    });
}

const pixels = Buffer.alloc(SIZE * SIZE * 3);
let missing = 0;
for (let row = 0; row < SIZE; row++) {
    const lat = SURROUNDINGS.north - ((row + 0.5) / SIZE) * (SURROUNDINGS.north - SURROUNDINGS.south);
    for (let col = 0; col < SIZE; col++) {
        const lon = SURROUNDINGS.west + ((col + 0.5) / SIZE) * (SURROUNDINGS.east - SURROUNDINGS.west);
        const [east, north] = toUtm([lat, lon]);
        let colour = null;
        for (const unusable of [FILL | DOUBTFUL, FILL]) for (const frame of frames) if (!colour) colour = colourAt(frame, east, north, unusable);
        if (!colour) missing++;
        (colour ?? [0, 0, 0]).forEach((r, c) => {
            pixels[(row * SIZE + col) * 3 + c] = Math.round(255 * Math.min(1, Math.max(0, r * GAIN)) ** GAMMA);
        });
    }
}
mkdirSync(OUTPUT.split('/').slice(0, -1).join('/'), { recursive: true });
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } }).jpeg({ quality: QUALITY, mozjpeg: true }).toFile(OUTPUT);
console.info(`[landsat] wrote ${OUTPUT}; ${((100 * missing) / (SIZE * SIZE)).toFixed(2)}% of it had no clean pixel`);
