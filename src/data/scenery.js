/** Photographed rock (Poly Haven, CC0; scripts/import-texture.mjs): the blasted cut beside the road
 *  (rock_face_03, greyed to granite at saturation 0.2) and the lichen-grown rock of every natural slope
 *  too steep for soil (lichen_rock), each `metres` across in the photograph. */
export const SCENERY_TEXTURES = {
    rock: { map: 'assets/textures/rock_face_03/diffuse.jpg', normal: 'assets/textures/rock_face_03/normal.jpg', metres: 2.7 },
    cliff: { map: 'assets/textures/lichen_rock/diffuse.jpg', normal: 'assets/textures/lichen_rock/normal.jpg', metres: 2 },
};

/** A real aerial photograph of mossy, rocky mountainside (Poly Haven aerial_rocks_04, CC0, greyed to a
 *  detail texture), multiplied over the land's satellite colours at a broad and a close scale (m). The
 *  ground is bare rock where the upward part of its normal falls below bareRock[0], soil above [1]. */
export const LAND_DETAIL = {
    map: 'assets/textures/aerial_rocks_04/diffuse.jpg',
    metres: [80, 12],
    bareRock: [0.45, 0.62],
    /** Close up detail and photographed rock fade out over these distances (m): beyond them the
     *  ground keeps only the broad detail and the rock's average colour. */
    reach: [250, 400],
    /** Close up, the ground is this share the floor of the coastal pine forest (Poly Haven
     *  forest_ground_04, CC0), `metres` across in the photograph. */
    floor: { map: 'assets/textures/forest_ground_04/diffuse.jpg', metres: 3.15, share: 0.6 },
};

/** The houses and buildings along the route (scripts/import-buildings.mjs, from OpenStreetMap). */
export const ROUTE_BUILDINGS = 'assets/terrain/sea-to-sky/buildings.json';

/** Paint and roofing of the route's houses, picked per building: painted and cedar-sided walls, asphalt
 *  shingle and cedar shake roofs. */
export const BUILDING_COLORS = {
    walls: ['#e6e1d6', '#d6c9ae', '#b8b1a4', '#8b6f53', '#a1998b', '#c8c0ad', '#6e5946', '#dbd5c6', '#7e8a8b'],
    roofs: ['#3c3e41', '#4b4139', '#2e3135', '#5b4b3d', '#3d4a3f', '#56595c'],
    /** Each building's colours are brightened or darkened by up to this share. */
    variation: 0.08,
};

/** The coastal forest of Douglas fir and hemlock (src/world/conifer.js, Forest.js). A tree is `whorls`
 *  rings of `branches` branch sprays from `crownBase` of its height to its top, reaching `spread` of
 *  its height at the bottom and narrowing by `taper`, drooping by up to `droop` rad; each spray is two
 *  crossed cards `width` of its length across. Off in the distance a tree is three crossed cards of
 *  its whole silhouette. */
export const FOREST = {
    tree: { whorls: 16, branches: 7, crownBase: 0.18, spread: 0.23, taper: 0.9, droop: 0.4, width: 0.75, trunk: [0.004, 0.02] },
    /** Seeds of the different tree shapes, and how tall the trees grow (m). */
    shapes: [7, 19, 31],
    heights: [12, 34],
    /** Trees are bunched in squares `chunk` m across; those within `near` m of the car are drawn whole. */
    chunk: 400,
    near: 450,
    /** Trees per hectare on the slopes right by the road, and on the land beyond: up to each distance
     *  from the road (m), that many. */
    density: { roadside: 90, land: [[300, 35], [1200, 8]] },
    /** No trees grow above this height (m) or on ground steeper than LAND_DETAIL.bareRock allows. */
    treeLine: 1400,
    colors: { needles: ['#1d3a22', '#27482a', '#33582f', '#46703a'], bark: '#4b3527' },
    /** Each tree's colour is brightened or darkened by up to this share. */
    variation: 0.18,
};

/** Authored scenery models: the gas station at the end of each stage and on the refuelling screen. */
export const SCENERY_MODELS = {
    station: {
        model: 'assets/models/station/model.glb',
        // Where a car fills up, [x, z] in the model's frame (x away from the road, -z along it): beside
        // the pump island, nose up the road.
        bay: [-4.8, 0.7],
    },
};
