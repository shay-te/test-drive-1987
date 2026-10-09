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
    floor: { map: 'assets/textures/forest_ground_04/diffuse.jpg', metres: 3.15, share: 0.8 },
};

/** The houses and buildings along the route (scripts/import-buildings.mjs, from OpenStreetMap). */
export const ROUTE_BUILDINGS = 'assets/terrain/sea-to-sky/buildings.json';

/** The railway along the route out of its tunnels (scripts/import-railway.mjs, from OpenStreetMap):
 *  BC Rail's line from North Vancouver to Squamish, on its bench above the shore of Howe Sound. */
export const ROUTE_RAILWAY = 'assets/terrain/sea-to-sky/railway.json';

/** How the railway is laid: a point every `step` m, its bed the ground smoothed over `smooth` m along
 *  the line (a railway climbs gently), kept `clearance` m off the road's corridor (where it passes
 *  under or over the highway out of sight), at least `aboveSea` m over the water (along the shore the
 *  line runs on fill above high water). The ballast bed `bed.top` m wide at its top, `bed.height` m
 *  over the ground under all of it and spreading `bed.spread` m either side down to the ground; standard-gauge
 *  track (`gauge`, m between the rails' heads) of `rail` [width, height] (m) on ties `tie` [length,
 *  width] (m) every `tieSpacing` m; a bridge's steel girder `girder` m deep. */
export const RAILWAY = {
    step: 2,
    smooth: 30,
    clearance: 3,
    aboveSea: 2.5,
    bed: { top: 3.4, height: 0.35, spread: 1.2 },
    gauge: 1.435,
    rail: [0.07, 0.16],
    tie: [2.6, 0.23],
    tieSpacing: 0.6,
    girder: 1.4,
};

/** Paint and roofing of the route's houses, picked per building: painted and cedar-sided walls, asphalt
 *  shingle and cedar shake roofs. */
export const BUILDING_COLORS = {
    walls: ['#e6e1d6', '#d6c9ae', '#b8b1a4', '#8b6f53', '#a1998b', '#c8c0ad', '#6e5946', '#dbd5c6', '#7e8a8b'],
    roofs: ['#3c3e41', '#4b4139', '#2e3135', '#5b4b3d', '#3d4a3f', '#56595c'],
    /** Each building's colours are brightened or darkened by up to this share. */
    variation: 0.08,
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
