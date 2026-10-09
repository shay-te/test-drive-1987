import { BUILDINGS, ROAD } from '../config.js';
import { MOUNTAIN_NEAR } from '../sim/Landscape.js';
import { unpackMicro, worldOf } from './routeFrame.js';

/** A point further than this (m) from where the road frame puts it lies off the stage's ends. */
const OFF_FRAME = 1;
/** Every SCAN-th node is tried for the nearest one before projecting onto the road. */
const SCAN = 4;
/** Footprints are bucketed in squares this wide (m) to find the ones over a point. */
const HASH_CELL = 50;

/** The footprints of `data` (scripts/import-buildings.mjs) as rings of [lat, lon]. */
function footprints(data) {
    return data.buildings.map((building) => {
        return { ...building, ring: unpackMicro(building.p) };
    });
}

/** The real buildings that stand around a stage: each footprint in world space ({ x, z } corners), its
 *  base (sunk into the ground), the height of the eaves at each corner and the roof's. Downhill a
 *  building stands on whatever is drawn (the drop or the terrain), uphill on the terrain past the cut's
 *  ribbons; those in the road's corridor, astride the road, in the sea or off the landscape are left out. */
export function layOutBuildings(data, track, landscape) {
    const l = landscape;
    const inside = ({ x, z }) => {
        return l.covers(x, z);
    };
    const placed = [];
    for (const [index, building] of footprints(data).entries()) {
        const ring = building.ring.map(([lat, lon]) => { return worldOf(track, lat, lon); });
        if (!ring.every(inside)) continue;
        let hint = track.nearestNode(ring[0].x, ring[0].z, SCAN);
        let sides = 0;
        const grounds = [];
        for (const corner of ring) {
            const p = track.project(corner.x, corner.z, hint);
            hint = p.i;
            const on = track.toWorld(p.s, p.u);
            const beside = Math.hypot(on.x - corner.x, on.z - corner.z) < OFF_FRAME;
            // Uphill, the cut's ribbons and the grid's climb from under them take a grid cell past MOUNTAIN_NEAR.
            if (beside && p.u > ROAD.edgeOffset - BUILDINGS.clearance && p.u < MOUNTAIN_NEAR + l.cell) break;
            if (beside) sides |= p.u < 0 ? 1 : 2;
            // Beyond the cut only the grid is drawn; everywhere else whatever is on top (the drop, mostly).
            grounds.push(beside && p.u > 0 ? l.terrainAt(corner.x, corner.z) : l.heightAt(corner.x, corner.z));
        }
        const lowest = Math.min(...grounds);
        if (grounds.length < ring.length || sides === 3 || lowest < l.waterLevel + BUILDINGS.dryAbove) continue;
        // A pitched roof sits level over the highest corner; a flat one steps up the hill with the ground.
        const level = Math.max(...grounds);
        const eaves = grounds.map((ground) => { return (building.roof > 0 ? level : ground) + building.h; });
        placed.push({ index, ring, base: lowest - BUILDINGS.sink, eaves, roof: building.roof });
    }
    return placed;
}

/** `placements` ({ x, z }) not standing inside any of the `buildings`' footprints. */
export function clearOfBuildings(placements, buildings) {
    const cells = new Map();
    const key = (x, z) => { return `${Math.floor(x / HASH_CELL)},${Math.floor(z / HASH_CELL)}`; };
    for (const building of buildings) {
        const xs = building.ring.map((p) => { return p.x; });
        const zs = building.ring.map((p) => { return p.z; });
        for (let x = Math.min(...xs); x < Math.max(...xs) + HASH_CELL; x += HASH_CELL) {
            for (let z = Math.min(...zs); z < Math.max(...zs) + HASH_CELL; z += HASH_CELL) {
                const k = key(x, z);
                if (!cells.has(k)) cells.set(k, new Set());
                cells.get(k).add(building);
            }
        }
    }
    return placements.filter((p) => {
        return ![...(cells.get(key(p.x, p.z)) ?? [])].some((building) => { return within(p, building.ring); });
    });
}

/** Whether point (x, z) lies inside the polygon `ring` (even-odd rule). */
function within({ x, z }, ring) {
    let odd = false;
    ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) odd = !odd;
    });
    return odd;
}
