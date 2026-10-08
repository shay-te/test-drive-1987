/** Global tunables. Units: metres, seconds, kilograms, radians unless noted. */

/** Logical canvas resolution. 16:10, the aspect ratio of the original 320x200 screen. */
export const VIEW = Object.freeze({
    width: 1280,
    height: 800,
    /** Screen row of the optical centre (eye-level horizon) through the windshield. */
    horizonY: 252,
    /** Lowest screen row of the windshield that can ever be seen above the dashboard. */
    windshieldBottom: 480,
    /** Horizontal field of view of the driver's eye. */
    hfovDeg: 78,
    /** Rear-view mirror glass in logical pixels. */
    mirror: Object.freeze({ x: 952, y: 92, w: 272, h: 78 }),
});

export const ROAD = Object.freeze({
    /** Length of one track segment. */
    segment: 4,
    laneWidth: 3.6,
    /** Road centre to the outer edge of the asphalt. */
    halfWidth: 3.6,
    /** Width of the gravel shoulder on the valley (left) side. */
    shoulderLeft: 1.5,
    /** Default distance from the centre line to the foot of the rock face (right). */
    wallOffset: 5.2,
    /** Lateral position of the delineator posts / guard rail on the valley side. */
    postOffset: -5.0,
    /** Beyond this lateral position the car goes over the edge. */
    edgeOffset: -5.6,
    /** Driver eye position relative to the car centre (left-hand drive). */
    eyeOffset: -0.36,
    eyeHeight: 1.08,
});

export const PHYS = Object.freeze({
    g: 9.81,
    airDensity: 1.2,
    rollingResistance: 0.013,
    mph: 0.44704,
    lbftToNm: 1.35582,
    lbToKg: 0.453592,
});

export const GAME = Object.freeze({
    stageCount: 5,
    chances: 5,
    speedLimitMph: 55,
    /** Passing a radar trap above this speed starts a pursuit. */
    radarTriggerMph: 65,
    ticketPenaltySec: 30,
    /** Fixed physics step. */
    physicsHz: 120,
});
