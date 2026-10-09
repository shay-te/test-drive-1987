import { PHYS } from '../config.js';
import { FOREST, LAND_DETAIL } from '../data/scenery.js';
import { MOUNTAIN_NEAR, SEA_LEVEL, VALLEY_NEAR } from '../sim/Landscape.js';
import { createRng, lerp } from '../util/math.js';

/** Trees grow from this height above the sea. */
export const TREE_LINE_LOW = 3;
/** A trunk starts this far into the ground, so it never stands on air over a slope. */
const TREE_SINK = 0.5;
/** Beyond the ribbons the grid only carries the real ground this much further out (m). */
const GRID_CLEAR = { valley: 15, mountain: 10 };
/** Natural clearings: where the landscape's noise at this scale falls below CLEARING. */
const CLEARING_SCALE = 0.08;
const CLEARING = -0.1;

/** Whether ground rising `rise` over `run` holds soil (LAND_DETAIL.bareRock). */
function holdsSoil(run, rise) {
    return Math.abs(run) / Math.hypot(run, rise) >= LAND_DETAIL.bareRock[0];
}

/** Trees on the road-side ribbons, FOREST.density.roadside a hectare: `sections(i)` lists, for track
 *  node `i`, each ribbon's cross-section ({ u, h } by rising u, h above the road) and the span of it
 *  (first, last point) the trees may take. [{ x, y, z, height }] */
export function roadsideTrees(track, sections, seed) {
    const rng = createRng(seed);
    const placements = [];
    const perSquareMetre = FOREST.density.roadside / PHYS.hectare;
    const place = (i, section, from, to) => {
        const u = lerp(section[from].u, section[to].u, rng());
        let k = from;
        while (k < to - 1 && section[k + 1].u < u) k++;
        const [a, b] = [section[k], section[k + 1]];
        if (!holdsSoil(b.u - a.u, b.h - a.h)) return;
        const h = lerp(a.h, b.h, (u - a.u) / (b.u - a.u));
        const p = track.nodeWorld(i, u, h - TREE_SINK, {});
        if (p.y > SEA_LEVEL + TREE_LINE_LOW) placements.push({ x: p.x, y: p.y, z: p.z, height: rng.range(...FOREST.heights) });
    };
    for (let i = 0; i < track.count; i++) {
        for (const [section, from, to] of sections(i)) {
            const expected = Math.abs(section[to].u - section[from].u) * track.segment * perSquareMetre;
            for (let n = Math.floor(expected + rng()); n > 0; n--) place(i, section, from, to);
        }
    }
    return placements;
}

/** The forest beyond the road's ribbons: in each cell of the landscape's grid FOREST.density.land
 *  trees a hectare for its distance from the road, on dry ground below the tree line that holds soil,
 *  with clearings. [{ x, y, z, height }] */
export function landTrees(landscape, seed) {
    const l = landscape;
    const rng = createRng(seed);
    const placements = [];
    const cellArea = (l.cell * l.cell) / PHYS.hectare;
    for (let iz = 1; iz < l.nz - 1; iz++) {
        for (let ix = 1; ix < l.nx - 1; ix++) {
            const k = iz * l.nx + ix;
            const side = l.sides[k];
            const distance = Math.abs(side);
            if (distance < (side < 0 ? VALLEY_NEAR + GRID_CLEAR.valley : MOUNTAIN_NEAR + GRID_CLEAR.mountain)) continue;
            const band = FOREST.density.land.find(([reach]) => { return distance <= reach; });
            if (!band || l.noise.noise2(ix * CLEARING_SCALE, iz * CLEARING_SCALE) < CLEARING) continue;
            const riseX = (l.heights[k + 1] - l.heights[k - 1]) / 2;
            const riseZ = (l.heights[k + l.nx] - l.heights[k - l.nx]) / 2;
            if (!holdsSoil(l.cell, Math.hypot(riseX, riseZ))) continue;
            for (let n = Math.floor(band[1] * cellArea + rng()); n > 0; n--) {
                const [gx, gz] = [ix + rng() - 0.5, iz + rng() - 0.5];
                const y = l.gridHeight(gx, gz);
                if (y < SEA_LEVEL + TREE_LINE_LOW || y > FOREST.treeLine) continue;
                placements.push({ x: l.x0 + gx * l.cell, z: l.z0 + gz * l.cell, y: y - TREE_SINK, height: rng.range(...FOREST.heights) });
            }
        }
    }
    return placements;
}
