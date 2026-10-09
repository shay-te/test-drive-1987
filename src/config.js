/** Global tunables. Units: metres, seconds, kilograms, radians unless noted. */

/** Logical canvas resolution. 16:10, the aspect ratio of the original 320x200 screen. */
export const VIEW = Object.freeze({
    width: 1280,
    height: 800,
    /** Screen row of the optical centre (eye-level horizon) through the windshield. */
    horizonY: 252,
    /** Horizontal field of view of the driver's eye. */
    hfovDeg: 78,
});

/** Lighting and reflection quality, shared by driving and asset inspection. */
export const LIGHTING = Object.freeze({
    environmentSize: 128,
    environmentNear: 0.1,
    environmentHeight: 1.2,
    environmentIntensity: 0.65,
    groundRadius: 200,
    groundColor: '#564b40',
    cabinShadowExtent: 2.6,
    cabinShadowNormalBias: 0.002,
    cabinSky: 0.32,
    skyIntensity: 1.8,
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

/** Guard rail, a steel W-beam on posts (src/sim/TrackBuilder.js lays it, src/world/guardRail.js
 *  draws it). It stands where the real ground `reach` m beyond the edge lies `depth` m or more below
 *  the road, as an embankment that steep warrants a barrier; runs closer than `gap` m join, runs
 *  shorter than `shortest` m are left out, and each carries on `flare` m into its turned-down ends.
 *  Hit faster than `breach` m/s sideways it gives way and the car goes over the edge. */
export const RAIL = Object.freeze({
    reach: 6,
    depth: 3,
    gap: 40,
    shortest: 30,
    flare: 8,
    breach: 9,
});

/** Where the route's real buildings may stand (src/world/buildingLayout.js). */
export const BUILDINGS = Object.freeze({
    /** Clear of the road's edge by this much (m) on the valley side. */
    clearance: 2,
    /** Walls start this far (m) below the lowest corner's ground, so no slope shows under them. */
    sink: 1,
    /** Ground under water deeper than this (m) is the sea: nothing is built there. */
    dryAbove: 0.3,
});

/** Engine voices (src/audio/EngineSound.js). */
export const ENGINE_SOUND = Object.freeze({
    /** The engine's level into the engine bus. */
    level: 0.9,
    /** Recordings play up to the first multiple of the highest one's rpm, handing over to the
     *  synthesiser by the second: past that they would only be pitched up, not heard as they are. */
    recordedReach: [1.25, 1.6],
});

export const PHYS = Object.freeze({
    g: 9.81,
    airDensity: 1.2,
    rollingResistance: 0.013,
    mph: 0.44704,
    foot: 0.3048,
    lbftToNm: 1.35582,
    /** One horsepower is one lb-ft of torque turning at this many rpm. */
    lbftRpmPerHp: 5252,
    lbToKg: 0.453592,
    /** Square metres in a hectare. */
    hectare: 10000,
});

/** How the brochure's figures were measured, and how the drivetrain is fitted to them. */
export const ROAD_TEST = Object.freeze({
    /** US magazines start the clock after the car has rolled one foot (m). */
    rollout: 0.3048,
    quarterMile: 402.336,
    /** The tester tries launch revs in steps of this many rpm and keeps the quickest to 60 mph. */
    launchStep: 250,
    /** Longest test run (s) and the bounds of the fitted torque factor. */
    duration: 30,
    torqueFactor: [0.6, 1.4],
    passes: 3,
    /** Share of peak power an engine still makes at its redline. */
    redlinePower: 0.92,
});

export const GAME = Object.freeze({
    stageCount: 5,
    chances: 5,
    speedLimitMph: 55,
    /** Passing a radar trap above this speed starts a pursuit. */
    radarTriggerMph: 65,
    /** Fixed physics step. */
    physicsHz: 120,
    /** Throttle below this speed (m/s) in neutral selects first gear, as a driver pulling away would. */
    pullAwaySpeed: 1,
    /** Within this many rpm of the redline, below top gear, the driver is told to shift up. */
    shiftHintRpm: 350,
});

/** How much of the world is drawn: all of it on a graphics card, less on a software renderer that
 *  draws on the CPU (a browser without a graphics driver, such as the CI's headless ones). `forest`
 *  is the share of the trees kept. */
export const GRAPHICS = Object.freeze({
    full: { forest: 1, shadows: true, doorMirrors: true },
    software: { forest: 0.15, shadows: false, doorMirrors: false },
});

/** A pursuit as the B.C. Police Commission's 1982 guidelines had it (in force through 1989; reproduced in
 *  its 1990 report "Police Pursuit in British Columbia"). A driver stopped (under `stoppedMph` for
 *  `stopSeconds`) within `signalRange` m of the patrol car has stopped for it; one who has not stopped
 *  `complySeconds` s after it came within `complyRange` m has failed to stop (Motor Vehicle Act s. 67).
 *  The officer then radios for assistance and a roadblock is ready `roadblockDelay` s later, at least
 *  `lead` m ahead, where a driver at the car's speed sees it in time to stop braking at `brake` m/s²
 *  with `margin` m to spare (s. 7.7): on a bend of radius R, with the cut or the trees `sightClearance`
 *  m inside the line, the road is seen about 2·sqrt(2·R·clearance) m ahead. Patrol cars stand broadside
 *  across it, as many as it takes from the edge to the cut.
 *  The patrol car follows `followGap` m behind and never boxes in or rams (s. 7.9-7.10). Stopping
 *  within `roadblockReach` m of the roadblock is stopping for it. */
export const POLICE = Object.freeze({
    stoppedMph: 3,
    stopSeconds: 1.5,
    signalRange: 250,
    complyRange: 150,
    complySeconds: 10,
    roadblockDelay: 40,
    lead: 1500,
    brake: 6,
    margin: 60,
    roadblockReach: 250,
    followGap: 18,
    sightClearance: 8,
    /** Time lost to a roadside speeding ticket (s). */
    ticketSeconds: 30,
});

/** How the car body and the driver's head move with the car (the camera rides on both). */
export const MOTION = Object.freeze({
    /** Body pitch and roll on its springs, radians per g. */
    bodyPitchPerG: 0.022,
    bodyRollPerG: 0.03,
    /** Head travel (m) and tilt (rad) per g: thrown outward in bends, forward under braking. */
    leanPerG: 0.05,
    nodPerG: 0.035,
    headPitchPerG: 0.04,
    headRollPerG: 0.06,
    /** Vertical road vibration (m) at 30 m/s, and its spatial frequency (cycles per metre). */
    buzz: Object.freeze({ asphalt: 0.0015, gravel: 0.007 }),
    buzzPerMetre: 0.8,
    /** Head velocity kick (m/s) per m/s of crash impact. */
    impactKick: 0.05,
});

/** Seated look-around limits, angular rate, pointer response, and tap threshold. */
export const LOOK = Object.freeze({
    yawLimit: 2.8,
    pitchUp: 0.9,
    pitchDown: 1.1,
    speed: 1.8,
    pointerSensitivity: 0.004,
    dragThreshold: 5,
});

/** A crash on the road, played out: the two cars thrown apart by the impact. */
export const CRASH = Object.freeze({
    /** Share of the closing speed the cars spring apart with (crumpling steel bounces little). */
    restitution: 0.25,
    /** Upward speed per m/s of closing speed as the cars ride up over each other, lighter one most. */
    rideUp: 0.12,
    /** Spin per m/s of closing speed: about the vertical for an off-centre hit (per metre off centre),
     *  and nose-up for the car riding up. */
    yawSpin: 0.35,
    pitchSpin: 0.08,
    /** Bounce off the rock face or a rail: the share of sideways speed kept, and the spin it gives. */
    wallBounce: 0.3,
    /** The rock face as a crashing car meets it: a slope it is pushed back off, not a sheer step. */
    wallSlope: 20,
    wallGap: 0.4,
    /** The wreck stops playing after this long even if the cars are still moving (s). */
    maxSeconds: 8,
    /** From then on ENTER skips to the crash notice (s). */
    skipAfter: 1.5,
    /** Where the crash is watched from: behind the impact, out over the drop, above the road (m); a
     *  car thrown further than `follow` is followed, looked down on from `lookDownDeg` above it. */
    camera: { back: 16, out: 9, up: 4.5, aimUp: 0.6, follow: 30, lookDownDeg: 35 },
    /** Under water the camera follows the car down: this far beyond it, above it, below the surface. */
    diver: { distance: 7, up: 1.2, belowSurface: 0.8 },
    /** Which hits of a wreck are heard: none softer than `audible` m/s, none within `cooldown` s of
     *  the last one heard unless `harder` times as hard; full volume from `loud` m/s. */
    sound: { audible: 4, cooldown: 0.35, harder: 1.6, loud: 30 },
});

/** Smoke pouring from a blown engine (src/sim/EngineSmoke.js): `rate` puffs a second from the engine
 *  bay, in car space (m; x right, y up, -z forward) by where the engine sits, each rising at `rise`
 *  m/s and spreading `spread` m/s, carried by the `wind` (m/s, world x and z), swelling from `size` by
 *  `grow` m a second and thinning out over its `life` (s), slowly at first (density 1 - (age /
 *  life)^`thinning`); at most `most` puffs at once, of oily grey `color` and `opacity` when fresh. */
export const SMOKE = Object.freeze({
    rate: 24,
    bay: { front: [0, 0.85, -1.5], mid: [0, 0.95, 0.9], rear: [0, 0.95, 1.7] },
    rise: [1.4, 2.6],
    spread: 0.5,
    wind: [0.9, 0.3],
    size: [0.5, 0.9],
    grow: 0.9,
    life: [3, 5.5],
    thinning: 2,
    most: 160,
    color: '#8e8c88',
    opacity: 0.8,
});

/** The sea a car goes into: how it floats, floods and sinks, and what the water does around it. */
export const WATER = Object.freeze({
    /** Sea water and steel (kg/m3). */
    density: 1025,
    steel: 7850,
    /** Share of a car's bounding box that is air as it goes in, and how long it takes to fill (s). */
    airShare: 0.4,
    floodSeconds: 6,
    /** The water's drag on the whole car (drag coefficient times area, m2); a hull point is fully
     *  in once this deep (m). */
    dragArea: 3,
    surface: 0.25,
    /** The car counts as under water once its centre is this deep (m). */
    underwater: 1,
    /** Splash: droplets per m/s the car goes in at, their upward and outward speeds (m/s) and size (m). */
    splashPerSpeed: 6,
    splashUp: [3, 9],
    splashOut: [1, 5],
    dropSize: [0.04, 0.12],
    /** Bubbles released per m3 of air the car loses, from within this box around its centre (m), their
     *  size at the depth they left (m), how fast they rise (m/s) and wobble (m, Hz). */
    bubblesPerAir: 60,
    bubbleSpread: [0.8, 0.5, 1.8],
    bubbleSize: [0.03, 0.09],
    rise: [0.6, 1.2],
    wobble: { amount: 0.25, hz: [1.5, 3] },
    /** Depth of sea water that presses as hard as the air above it (m). */
    atmosphere: 10.3,
    /** The water's look from inside: fog colour and density, and the daylight that gets down. */
    fog: { color: '#1f5763', density: 0.06 },
    light: 0.4,
    /** Fish around a sunk car: how many, their circling radius (m), speed (m/s), depth band around
     *  the car (m), size (m) and how fast their tails beat (Hz). */
    fish: { count: 28, radius: [3, 9], speed: [0.6, 1.4], depth: [-1.5, 2.5], size: [0.25, 0.45], tailHz: 3 },
    /** A fish's girth and depth as shares of its length, and how far its tail swings (rad). */
    fishShape: { width: 0.16, height: 0.28, tailSwing: 0.6 },
    colors: { fish: '#8e9d9b', bubble: '#d6eff3', drop: '#eef6f7' },
    /** Most droplets or bubbles drawn at once. */
    maxParticles: 800,
});

/** The outside camera (V): behind and above the car, its yaw easing after the car's. */
export const CHASE = Object.freeze({
    /** Metres behind and above the car's origin. */
    distance: 7,
    height: 2.4,
    /** The point it looks at: ahead of the car, above the road. */
    aimAhead: 4,
    aimHeight: 0.9,
    /** How fast its yaw catches up with the car's (1/s). */
    followRate: 4,
    verticalFovDeg: 50,
    /** The rear-view mirror shown at the top of the outside view (layout px): its size, how far down. */
    mirror: { width: 340, height: 96, top: 14, frame: 5 },
});

/** Layout and demonstration settings for the isolated cabin inspection screen. */
export const PREVIEW = Object.freeze({
    titleY: 30,
    hintsY: 60,
    viewsY: 90,
    viewSpacing: 170,
    crack: { x: 640, y: 200, seed: 1987 },
    radar: 0.75,
});

/** A car over the edge is a rigid body tumbling down to the valley. Contact values are per hull point. */
export const FALL = Object.freeze({
    substep: 1 / 480,
    /** Crushing contact: N per metre of penetration and N per m/s closing speed (little bounce). */
    stiffness: 2e6,
    damping: 2.7e4,
    /** Sliding friction of steel on rock, a sticking term (N per m/s), and rolling wheels' share. */
    friction: 0.7,
    /** Off the road, on ground that holds soil, the undergrowth and the trees hold a car back as if
     *  this rough: it stops on the slope instead of sliding down to the sea. */
    brush: 1.5,
    grip: 1.5e5,
    rolling: 0.06,
    /** A hit this hard (m/s) smashes the wheels: from then on they drag instead of rolling. */
    wreckSpeed: 12,
    dragArea: 0.8,
    /** Below these the wreck counts as stopped once it has stayed so for `restSeconds`. */
    restSpeed: 0.3,
    restSpin: 0.3,
    restSeconds: 1,
    maxSeconds: 45,
    /** A contact closing faster than this (m/s) is a hit: a crash sound and a jolt. */
    hitSpeed: 4,
    /** Floor pan and sills above the road, wheels inset from the body sides (m). */
    sill: 0.22,
    belt: 0.9,
    wheelInset: 0.11,
    /** Integration safety: a sticking contact stops at most this share of the body's mass per step,
     *  and spin (rad/s) is capped far above anything a real wreck does. */
    stickShare: 0.15,
    maxSpin: 25,
    /** A traffic vehicle's centre of mass as a share of its height, and its axles from either end (m). */
    trafficCg: 0.4,
    axleFromEnd: 0.9,
});
