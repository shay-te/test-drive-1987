import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILDINGS, ROAD } from '../src/config.js';
import { ROUTE_BUILDINGS } from '../src/data/scenery.js';
import { STAGES } from '../src/data/stages.js';
import { MOUNTAIN_NEAR } from '../src/sim/Landscape.js';
import { layOutStage, restoreStage } from '../src/sim/stageData.js';
import { clearOfBuildings, layOutBuildings } from '../src/world/buildingLayout.js';

const data = JSON.parse(readFileSync(new URL(`../${ROUTE_BUILDINGS}`, import.meta.url)));
const stages = STAGES.map((_, index) => { return restoreStage(layOutStage(index)); });
const placedOn = stages.map(({ track, landscape }) => { return layOutBuildings(data, track, landscape); });

test('the route\'s buildings come from the map with believable walls and roofs', () => {
    assert.ok(data.buildings.length > 2000, `${data.buildings.length} buildings`);
    for (const building of data.buildings) {
        assert.ok(building.p.length >= 6 && building.p.length % 2 === 0, 'a footprint of three or more corners');
        assert.ok(building.h >= 2 && building.h <= 80, `walls ${building.h} m`);
        assert.ok(building.roof >= 0 && building.roof <= 3.5, `roof ${building.roof} m`);
    }
});

test('every stage passes houses: Horseshoe Bay, Lions Bay, Britannia Beach, Squamish', () => {
    placedOn.forEach((placed, i) => {
        assert.ok(placed.length > 100, `${STAGES[i].name}: ${placed.length} buildings`);
    });
});

test('no building stands on the road, over the cut or in the sea, and none floats', () => {
    stages.forEach(({ track, landscape }, i) => {
        for (const building of placedOn[i]) {
            building.ring.forEach((corner, k) => {
                const p = track.project(corner.x, corner.z, track.project(building.ring[0].x, building.ring[0].z, 0).i);
                const on = track.toWorld(p.s, p.u);
                const beside = Math.hypot(on.x - corner.x, on.z - corner.z) < 1;
                if (beside) {
                    assert.ok(p.u <= ROAD.edgeOffset - BUILDINGS.clearance || p.u >= MOUNTAIN_NEAR, `${STAGES[i].name}: a corner at u=${p.u.toFixed(1)}`);
                }
                // Below the road the drop is drawn over the grid; elsewhere the grid is all there is.
                const ground = beside && p.u < 0 ? landscape.heightAt(corner.x, corner.z) : landscape.terrainAt(corner.x, corner.z);
                assert.ok(building.base < ground, 'the walls start under the ground');
                assert.ok(building.eaves[k] > ground, 'the eaves stand above it');
                assert.ok(ground > landscape.waterLevel, 'on dry land');
            });
        }
    });
});

test('trees are kept out of the buildings', () => {
    const [building] = placedOn[1];
    const centre = building.ring.reduce((sum, p) => {
        return { x: sum.x + p.x / building.ring.length, z: sum.z + p.z / building.ring.length };
    }, { x: 0, z: 0 });
    const outside = { x: centre.x + 500, z: centre.z };
    assert.deepEqual(clearOfBuildings([centre, outside], [building]), [outside]);
});
