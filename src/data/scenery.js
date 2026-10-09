/** Photographed rock (Poly Haven, CC0; scripts/import-texture.mjs): the blasted cut beside the road
 *  (rock_face_03, greyed to granite at saturation 0.2) and the lichen-grown rock of the drop below it
 *  (lichen_rock), each `metres` across in the photograph. */
export const SCENERY_TEXTURES = {
    rock: { map: 'assets/textures/rock_face_03/diffuse.jpg', normal: 'assets/textures/rock_face_03/normal.jpg', metres: 2.7 },
    cliff: { map: 'assets/textures/lichen_rock/diffuse.jpg', normal: 'assets/textures/lichen_rock/normal.jpg', metres: 2 },
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
