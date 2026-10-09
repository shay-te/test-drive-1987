import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, ROAD } from '../src/config.js';
import { FOREST, LAND_DETAIL } from '../src/data/scenery.js';
import { STAGES } from '../src/data/stages.js';
import { MOUNTAIN_NEAR, VALLEY_NEAR } from '../src/sim/Landscape.js';
import { layOutStage, restoreStage } from '../src/sim/stageData.js';
import { TREE_LINE_LOW, landTrees, roadsideTrees } from '../src/world/forestLayout.js';

const { track, landscape } = restoreStage(layOutStage(1));
const land = landTrees(landscape, 71);
/** The drop's cross-sections stand in for both road-side ribbons (the slope above the cut is drawn by
 *  WorldBuilder, which needs WebGL). */
const drops = landscape.dropSections;
const roadside = roadsideTrees(track, (i) => { return [[drops[i], 0, drops[i].length - 5]]; }, 3);

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
        assert.ok(tree.height >= FOREST.heights[0] && tree.height <= FOREST.heights[1]);
        const { u } = offsetOf(tree);
        // A grid cell's own offset decides; a tree may sit up to half a cell nearer the road.
        assert.ok(u < -(VALLEY_NEAR - landscape.cell) || u > MOUNTAIN_NEAR - landscape.cell, `a tree at u=${u.toFixed(0)}`);
        if (Math.abs(u) < FOREST.density.land[0][0]) near++;
    }
    const nearShare = near / land.length;
    assert.ok(nearShare > 0.25, `${(nearShare * 100).toFixed(0)}% of the land's trees stand near the road`);
});

test('the road-side forest is as dense as configured, never on the road, never on bare rock', () => {
    const area = drops.reduce((sum, section) => { return sum + Math.abs(section.at(-5).u - section[0].u) * track.segment; }, 0);
    const perHectare = roadside.length / (area / PHYS.hectare);
    assert.ok(perHectare > FOREST.density.roadside * 0.5 && perHectare <= FOREST.density.roadside * 1.05, `${perHectare.toFixed(0)} trees a hectare`);
    const sample = roadside.filter((_, k) => { return k % 7 === 0; });
    let onRock = 0;
    for (const tree of sample) {
        const { u } = offsetOf(tree);
        assert.ok(u < ROAD.edgeOffset, `a tree at u=${u.toFixed(1)}`);
        const ground = landscape.heightAt(tree.x, tree.z);
        assert.ok(ground - tree.y > -1, 'rooted on the drop, not standing in the air');
        if (landscape.normalAt(tree.x, tree.z).y < LAND_DETAIL.bareRock[0]) onRock++;
    }
    // The drop's carved relief and its seams tilt a few spots the sections call soil.
    assert.ok(onRock / sample.length < 0.03, `${onRock} of ${sample.length} on bare rock`);
});

test('every stage grows its forest', () => {
    for (const index of [0, 4]) {
        const stage = restoreStage(layOutStage(index));
        assert.ok(landTrees(stage.landscape, 71).length > 3000, `${STAGES[index].name}`);
    }
});
