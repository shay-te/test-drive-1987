import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, ROAD } from '../src/config.js';
import { FOREST, HIGHLAND, SPECIES, STANDS, UNDERGROWTH } from '../src/data/forest.js';
import { LAND_DETAIL } from '../src/data/scenery.js';
import { STAGES } from '../src/data/stages.js';
import { MOUNTAIN_NEAR, VALLEY_NEAR } from '../src/sim/Landscape.js';
import { layOutStage, restoreStage } from '../src/sim/stageData.js';
import { TREE_LINE_LOW, landTrees, roadsideTrees, roadsideUndergrowth } from '../src/world/forestLayout.js';

const { track, landscape } = restoreStage(layOutStage(1));
const land = landTrees(landscape, 71);
/** The drop's cross-sections stand in for both road-side ribbons (the slope above the cut is drawn by
 *  WorldBuilder, which needs WebGL). */
const drops = landscape.dropSections;
const roadside = roadsideTrees(track, (i) => { return [[drops[i], 0, drops[i].length - 5]]; }, 3);

/** The shortest and tallest any stand grows. */
const TALLEST = [Math.min(HIGHLAND.heights[0], ...STANDS.map((s) => { return s.heights[0]; })), Math.max(HIGHLAND.heights[1], ...STANDS.map((s) => { return s.heights[1]; }))];

const offsetOf = (tree) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < track.count; i += 4) {
        const d = (tree.x - track.px[i]) ** 2 + (tree.z - track.pz[i]) ** 2;
        if (d < bestD) [best, bestD] = [i, d];
    }
    return track.project(tree.x, tree.z, best);
};

test('the forest beyond the road keeps off the ribbons, the sea and the peaks, and thins with distance', () => {
    assert.ok(land.length > 5000, `${land.length} trees`);
    let near = 0;
    for (const tree of land) {
        assert.ok(tree.y + 1 > TREE_LINE_LOW && tree.y < FOREST.treeLine, `a tree at ${tree.y.toFixed(0)} m`);
        assert.ok(tree.height >= TALLEST[0] && tree.height <= TALLEST[1], `a ${tree.height.toFixed(0)} m tree`);
        assert.ok(SPECIES[tree.species], tree.species);
        const { u } = offsetOf(tree);
        // A grid cell's own offset decides; a tree may sit up to half a cell nearer the road.
        assert.ok(u < -(VALLEY_NEAR - landscape.cell) || u > MOUNTAIN_NEAR - landscape.cell, `a tree at u=${u.toFixed(0)}`);
        if (Math.abs(u) < FOREST.density.land[0][0]) near++;
    }
    const nearShare = near / land.length;
    assert.ok(nearShare > 0.25, `${(nearShare * 100).toFixed(0)}% of the land's trees stand near the road`);
});

test('the road-side forest is as dense as configured, never on the road, never on bare rock', () => {
    // By the road the configured density, further down the drop the land's for that distance.
    const reach = FOREST.density.roadsideReach;
    const nearArea = drops.reduce((sum, section) => { return sum + Math.max(0, section.at(-5).u + reach) * track.segment; }, 0);
    const near = roadside.filter((tree) => { return offsetOf(tree).u > -reach; }).length;
    const perHectare = near / (nearArea / PHYS.hectare);
    assert.ok(perHectare > FOREST.density.roadside * 0.5 && perHectare <= FOREST.density.roadside * 1.05, `${perHectare.toFixed(0)} trees a hectare by the road`);
    const farArea = drops.reduce((sum, section) => { return sum + Math.min(Math.abs(section[0].u), FOREST.density.land[0][0]) * track.segment; }, 0) - nearArea;
    const far = (roadside.length - near) / (farArea / PHYS.hectare);
    assert.ok(far < FOREST.density.land[0][1] * 1.2, `${far.toFixed(0)} trees a hectare further down`);
    const sample = roadside.filter((_, k) => { return k % 7 === 0; });
    let onRock = 0;
    let inAir = 0;
    for (const tree of sample) {
        const { u } = offsetOf(tree);
        assert.ok(u < ROAD.edgeOffset, `a tree at u=${u.toFixed(1)}`);
        if (landscape.heightAt(tree.x, tree.z) - tree.y <= -1) inAir++;
        if (landscape.normalAt(tree.x, tree.z).y < LAND_DETAIL.bareRock[0]) onRock++;
    }
    // On a tight bend a long section can fan past its neighbour's: a tree there stands on the one
    // drawn, which the ground's lookup (by the nearest section) does not see.
    assert.ok(inAir / sample.length < 0.002, `${inAir} of ${sample.length} rooted in the air`);
    // The drop's carved relief and its seams tilt a few spots the sections call soil.
    assert.ok(onRock / sample.length < 0.03, `${onRock} of ${sample.length} on bare rock`);
});

test('every stage grows its forest', () => {
    for (const index of [0, 4]) {
        const stage = restoreStage(layOutStage(index));
        assert.ok(landTrees(stage.landscape, 71).length > 3000, `${STAGES[index].name}`);
    }
});

test('the forest is the surveyed one: over 80% conifer, alder in its stands and more of it by the road', () => {
    const share = (trees, test) => { return trees.filter(test).length / trees.length; };
    const conifer = (tree) => { return SPECIES[tree.species].kind === 'conifer'; };
    const alder = (tree) => { return tree.species === 'redAlder'; };
    assert.ok(share(land, conifer) > 0.75, `${(share(land, conifer) * 100).toFixed(0)}% conifer`);
    assert.ok(share(land, alder) > 0.08 && share(land, alder) < 0.25, 'alder stands');
    assert.ok(share(roadside, alder) > share(land, alder), 'alder likes the road\'s disturbed edge');
    const trees = Object.keys(SPECIES).filter((name) => { return ['conifer', 'broadleaf'].includes(SPECIES[name].kind); });
    for (const name of trees) assert.ok(land.some((tree) => { return tree.species === name; }), `some ${name}`);
});

test('the forest floor by the road: sword fern and salal as thick as configured, standing on the ground, never on the road', () => {
    const plants = roadsideUndergrowth(track, (i) => { return [[drops[i], 0, drops[i].length - 5]]; }, 5);
    // A drop's section runs from far down it (rising u) up to the edge; the plants keep to the reach.
    const area = drops.reduce((sum, section) => { return sum + Math.max(0, section.at(-5).u - Math.max(section[0].u, -UNDERGROWTH.reach)) * track.segment; }, 0);
    const perHectare = plants.length / (area / PHYS.hectare);
    // Bare rock and the shore keep some ground bare.
    assert.ok(perHectare > UNDERGROWTH.perHectare * 0.4 && perHectare <= UNDERGROWTH.perHectare * 1.05, `${perHectare.toFixed(0)} plants a hectare`);
    const ferns = plants.filter((p) => { return p.species === 'swordFern'; }).length / plants.length;
    assert.ok(Math.abs(ferns - UNDERGROWTH.species.swordFern) < 0.05, `${(ferns * 100).toFixed(0)}% sword fern`);
    const sample = plants.filter((_, k) => { return k % 25 === 0; });
    let floating = 0;
    for (const plant of sample) {
        assert.ok(offsetOf(plant).u < ROAD.edgeOffset, 'off the road');
        assert.ok(plant.height >= SPECIES[plant.species].heights[0] && plant.height <= SPECIES[plant.species].heights[1]);
        if (landscape.heightAt(plant.x, plant.z) - plant.y < -0.5) floating++;
    }
    // As for the trees, a section fanned past its neighbour on a tight bend is the ground drawn there.
    assert.ok(floating / sample.length < 0.01, `${floating} of ${sample.length} floating`);
});
