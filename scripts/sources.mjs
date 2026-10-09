/** Cached downloads and OpenStreetMap queries shared by the import scripts. */
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** Every download is kept here, so an import runs again offline. */
export const CACHE = 'tmp/route-cache';
const USER_AGENT = 'test-drive-1987-route-import/1.0 (https://github.com/shay-te/test-drive-1987)';
const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];
/** South, west, north, east: Horseshoe Bay to past Squamish. */
export const ROUTE_BOX = [49.355, -123.32, 49.77, -123.08];
/** Overpass's selection of BC 99's carriageways inside ROUTE_BOX, as the set `.hwy`. */
export const HIGHWAY = `way["ref"="BC 99"]["highway"~"^(motorway|trunk)$"](${ROUTE_BOX.join(',')})->.hwy;`;

/** `url`'s body, cached in `file`; `check` throws on a body that must not be kept (a server's error page). */
export async function download(url, file, options = {}, check = () => {}) {
    const path = `${CACHE}/${file}`;
    if (existsSync(path)) return readFileSync(path);
    mkdirSync(CACHE, { recursive: true });
    const response = await fetch(url, { ...options, headers: { 'User-Agent': USER_AGENT, ...options.headers } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    check(bytes);
    writeFileSync(path, bytes);
    return bytes;
}

/** The elements an Overpass `query` (JSON output) selects, cached in `file`, trying each server in turn. */
export async function overpass(query, file) {
    for (const server of OVERPASS) {
        try {
            const bytes = await download(server, file, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`,
            }, (body) => { JSON.parse(body.toString('utf8')); });
            return JSON.parse(bytes.toString('utf8')).elements;
        } catch (error) {
            console.warn(`[osm] ${server} failed (${error.message}); trying the next server`);
        }
    }
    throw new Error('No Overpass server answered');
}
