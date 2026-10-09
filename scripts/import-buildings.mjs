/** Imports every building within REACH m of the Sea-to-Sky Highway from OpenStreetMap (ODbL): Horseshoe
 *  Bay, Lions Bay, Britannia Beach, Squamish. Each keeps its footprint (microdegrees, the first corner
 *  absolute and the rest as steps), its wall height and the height of its roof (0 for a flat roof).
 *  Usage: node scripts/import-buildings.mjs (the query is cached in tmp/route-cache) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROUTE_BUILDINGS } from '../src/data/scenery.js';
import { HIGHWAY, overpass } from './sources.mjs';

const REACH = 400;
const MICRO = 1e6;
const EARTH = 6371000;
/** Storey height (m), and the storeys a building has when OpenStreetMap doesn't say. */
const STOREY = 3;
const STOREYS = { apartments: 3, hotel: 3, cabin: 1, bungalow: 1, garage: 1, garages: 1, shed: 1, carport: 1, hut: 1, roof: 1, kiosk: 1 };
const DEFAULT_STOREYS = 2;
/** Houses and small buildings take a pitched roof this high per metre of the square root of their
 *  floor area, within ROOF_RANGE; larger ones (over PITCHED_AREA m2) and flat-tagged roofs are flat. */
const ROOF_PITCH = 0.22;
const ROOF_RANGE = [1.2, 3.5];
const PITCHED_AREA = 320;
const FLAT_KINDS = new Set(['commercial', 'industrial', 'retail', 'warehouse', 'school', 'roof', 'carport', 'service']);

/** Floor area (m2) of a ring of [lat, lon]. */
function area(ring) {
    const k = Math.PI / 180;
    const east = EARTH * Math.cos(ring[0][0] * k) * k;
    const north = EARTH * k;
    let twice = 0;
    ring.forEach(([lat, lon], i) => {
        const [lat2, lon2] = ring[(i + 1) % ring.length];
        twice += lon * east * lat2 * north - lon2 * east * lat * north;
    });
    return Math.abs(twice) / 2;
}

function storeys(tags) {
    const levels = Number.parseFloat(tags['building:levels']);
    return Number.isFinite(levels) && levels > 0 ? levels : STOREYS[tags.building] ?? DEFAULT_STOREYS;
}

const elements = await overpass(`[out:json][timeout:200];${HIGHWAY}way(around.hwy:${REACH})["building"];out geom tags;`, `buildings-${REACH}.json`);
const buildings = [];
for (const { geometry, tags } of elements) {
    const ring = geometry.map(({ lat, lon }) => { return [lat, lon]; });
    if (ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    if (ring.length < 3) continue;
    const floor = area(ring);
    const tagged = Number.parseFloat(tags.height);
    const walls = Number.isFinite(tagged) ? tagged : storeys(tags) * STOREY;
    const flat = tags['roof:shape'] === 'flat' || FLAT_KINDS.has(tags.building) || floor > PITCHED_AREA;
    const roof = flat ? 0 : Math.min(ROOF_RANGE[1], Math.max(ROOF_RANGE[0], ROOF_PITCH * Math.sqrt(floor)));
    const micro = ring.map(([lat, lon]) => { return [Math.round(lat * MICRO), Math.round(lon * MICRO)]; });
    const p = micro.flatMap((corner, i) => {
        return i === 0 ? corner : [corner[0] - micro[i - 1][0], corner[1] - micro[i - 1][1]];
    });
    buildings.push({ h: Number(walls.toFixed(1)), roof: Number(roof.toFixed(1)), p });
}
mkdirSync(ROUTE_BUILDINGS.split('/').slice(0, -1).join('/'), { recursive: true });
writeFileSync(ROUTE_BUILDINGS, `${JSON.stringify({ source: 'OpenStreetMap contributors (ODbL)', buildings })}\n`);
const pitched = buildings.filter((b) => { return b.roof > 0; }).length;
console.info(`[buildings] ${buildings.length} buildings within ${REACH} m of the highway, ${pitched} with pitched roofs -> ${ROUTE_BUILDINGS}`);
