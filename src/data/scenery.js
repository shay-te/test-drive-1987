/** Authored scenery models: the gas station at the end of each stage and on the refuelling screen. */
export const SCENERY_MODELS = {
    station: {
        model: 'assets/models/station/model.glb',
        // Where a car fills up, [x, z] in the model's frame (x away from the road, -z along it): beside
        // the pump island, nose up the road.
        bay: [-4.8, 0.7],
    },
};
