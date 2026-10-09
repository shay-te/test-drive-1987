import { PHYS } from '../config.js';
import { FOREST, HIGHLAND, STANDS } from '../data/forest.js';
import { LAND_DETAIL } from '../data/scenery.js';
import { MOUNTAIN_NEAR, SEA_LEVEL, VALLEY_NEAR } from '../sim/Landscape.js';
import { Noise, createRng, lerp } from '../util/math.js';

/** Trees grow from this height above the sea. */
export const TREE_LINE_LOW = 3;
/** A trunk starts this far into the ground, so it never stands on air over a slope. */
const TREE_SINK = 0.5;
/** Beyond the ribbons the grid only carries the real ground this much further out (m). */
const GRID_CLEAR = { valley: 15, mountain: 10 };
/** Natural clearings: where the landscape's noise at this scale falls below CLEARING. */
const CLEARING_SCALE = 0.08;
const CLEARING = -0.1;

/** The seed of the stands' pattern, offset from the stage's. */
const STAND_SEED = 404;

/** `weights` ({ name: share }) picked by `pick` (0..1). */
function weighted(weights, pick) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => { return sum + w; }, 0);
    let left = pick * total;
    for (const [name, w] of entries) {
        left -= w;
        if (left < 0) return name;
    }
    return entries.at(-1)[0];
}

/** What grows where: stands are patches of the land about FOREST.standSize across, each of a type, alder
 *  more often by the road; above HIGHLAND.above the montane forest. Returns `grow(x, y, z, roadside)`
 *  -> { species, height }. */
function forester(stage, rng) {
    const pattern = new Noise(stage.seed + STAND_SEED);
    const shares = (roadside) => {
        return Object.fromEntries(STANDS.map((stand) => {
            return [stand.name, stand.share * (roadside && stand.name === 'alder' ? FOREST.roadsideAlder : 1)];
        }));
    };
    return (x, y, z, roadside) => {
        if (y > HIGHLAND.above) return { species: weighted(HIGHLAND.species, rng()), height: rng.range(...HIGHLAND.heights) };
        // Each stand is a cell of the pattern, its type drawn from the cell's own (uniform) value.
        const { id } = pattern.cells3(x / FOREST.standSize, 0, z / FOREST.standSize);
        const stand = STANDS.find((s) => { return s.name === weighted(shares(roadside), Math.min(0.999, id)); });
        return { species: weighted(stand.species, rng()), height: rng.range(...stand.heights) };
    };
}

/** Canopy trees drawn a hectare `distance` m from the road (FOREST.density), 0 past the last band. */
function density(distance) {
    const d = FOREST.density;
    if (distance <= d.roadsideReach) return d.roadside;
    return d.land.find(([reach]) => { return distance <= reach; })?.[1] ?? 0;
}

/** Whether ground rising `rise` over `run` holds soil (LAND_DETAIL.bareRock). */
function holdsSoil(run, rise) {
    return Math.abs(run) / Math.hypot(run, rise) >= LAND_DETAIL.bareRock[0];
}

/** Trees on the road-side ribbons, as dense as their distance from the road has them: `sections(i)` lists, for track
 *  node `i`, each ribbon's cross-section ({ u, h } by rising u, h above the road) and the span of it
 *  (first, last point) the trees may take. [{ x, y, z, species, height }] */
export function roadsideTrees(track, sections, seed) {
    const rng = createRng(seed);
    const grow = forester(track.stage, rng);
    const placements = [];
    const perSquareMetre = FOREST.density.roadside / PHYS.hectare;
    const place = (i, section, from, to) => {
        const u = lerp(section[from].u, section[to].u, rng());
        // Sampled at the roadside density, kept at the density for its distance from the road.
        if (rng() * FOREST.density.roadside > density(Math.abs(u))) return;
        let k = from;
        while (k < to - 1 && section[k + 1].u < u) k++;
        const [a, b] = [section[k], section[k + 1]];
        if (!holdsSoil(b.u - a.u, b.h - a.h)) return;
        const h = lerp(a.h, b.h, (u - a.u) / (b.u - a.u));
        const p = track.nodeWorld(i, u, h - TREE_SINK, {});
        if (p.y > SEA_LEVEL + TREE_LINE_LOW) placements.push({ x: p.x, y: p.y, z: p.z, ...grow(p.x, p.y, p.z, true) });
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
 *  with clearings. [{ x, y, z, species, height }] */
export function landTrees(landscape, seed) {
    const l = landscape;
    const rng = createRng(seed);
    const grow = forester(l.track.stage, rng);
    const placements = [];
    const cellArea = (l.cell * l.cell) / PHYS.hectare;
    for (let iz = 1; iz < l.nz - 1; iz++) {
        for (let ix = 1; ix < l.nx - 1; ix++) {
            const k = iz * l.nx + ix;
            const side = l.sides[k];
            const distance = Math.abs(side);
            if (distance < (side < 0 ? VALLEY_NEAR + GRID_CLEAR.valley : MOUNTAIN_NEAR + GRID_CLEAR.mountain)) continue;
            const perHectare = density(distance);
            if (!perHectare || l.noise.noise2(ix * CLEARING_SCALE, iz * CLEARING_SCALE) < CLEARING) continue;
            const riseX = (l.heights[k + 1] - l.heights[k - 1]) / 2;
            const riseZ = (l.heights[k + l.nx] - l.heights[k - l.nx]) / 2;
            if (!holdsSoil(l.cell, Math.hypot(riseX, riseZ))) continue;
            for (let n = Math.floor(perHectare * cellArea + rng()); n > 0; n--) {
                const [gx, gz] = [ix + rng() - 0.5, iz + rng() - 0.5];
                const y = l.gridHeight(gx, gz);
                if (y < SEA_LEVEL + TREE_LINE_LOW || y > FOREST.treeLine) continue;
                const [x, z] = [l.x0 + gx * l.cell, l.z0 + gz * l.cell];
                placements.push({ x, z, y: y - TREE_SINK, ...grow(x, y, z, false) });
            }
        }
    }
    return placements;
}

/** `share` of the `trees`, every so many kept so the forest thins evenly. */
export function thinned(trees, share) {
    const every = Math.max(1, Math.round(1 / share));
    return trees.filter((_, i) => { return i % every === 0; });
}
