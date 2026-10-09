/** Photographed rock (Poly Haven, CC0; scripts/import-texture.mjs): the blasted cut beside the road
 *  (rock_face_03, greyed to granite at saturation 0.2) and the lichen-grown rock of the drop below it
 *  (lichen_rock), each `metres` across in the photograph. */
export const SCENERY_TEXTURES = {
    rock: { map: 'assets/textures/rock_face_03/diffuse.jpg', normal: 'assets/textures/rock_face_03/normal.jpg', metres: 2.7 },
    cliff: { map: 'assets/textures/lichen_rock/diffuse.jpg', normal: 'assets/textures/lichen_rock/normal.jpg', metres: 2 },
};

/** A real aerial photograph of mossy, rocky mountainside (Poly Haven aerial_rocks_04, CC0, greyed to a
 *  detail texture), multiplied over the land's satellite colours at a broad and a close scale (m). */
export const LAND_DETAIL = { map: 'assets/textures/aerial_rocks_04/diffuse.jpg', metres: [80, 12] };

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

/** Authored scenery models: the gas station at the end of each stage and on the refuelling screen. */
export const SCENERY_MODELS = {
    station: {
        model: 'assets/models/station/model.glb',
        // Where a car fills up, [x, z] in the model's frame (x away from the road, -z along it): beside
        // the pump island, nose up the road.
        bay: [-4.8, 0.7],
    },
};
