/** Geometry of the shared interior (logical px), traced from the 1987 PC cockpit. */
export const LAYOUT = {
    headliner: { h: 54 },
    visor: { x: 40, y: -24, w: 550, h: 108, r: 24 },
    radar: { x: 128, y: 30, w: 212, h: 50, ledX: 232, ledY: 62, ledGap: 17, leds: 6 },
    mirror: { bezel: 9, stemX: 1088, stemW: 18 },
    dash: { top: 442, faceTop: 478 },
    cowl: { x0: 132, x1: 828, peak: 422, lip: 506 },
    rightPanel: { x: 846 },
    trip: { x: 930, y: 540, w: 300, h: 108 },
    vent: { x: 896, y: 672, w: 384, h: 128, slat: 15 },
    roundVent: { x: 22, y: 604, r: 48 },
    hazard: { x: 806, y: 728, r: 14 },
    wheel: { x: 470, y: 782, outer: 322, inner: 282, hub: 96, badge: 48, maxTurnDeg: 110 },
    lever: { x: 902, y: 744, plateW: 150, plateH: 104, col: 44, row: 34 },
    radio: { x: 902, y: 516, w: 262, h: 122, display: { x: 946, y: 532, w: 174, h: 78 } },
    climate: { x: 914, y: 654, w: 236, h: 80 },
    glovebox: { x: 1180, y: 512, w: 150, h: 176 },
    ignition: { x: 92, y: 708, r: 21 },
    lightSwitch: { x: 66, y: 590, r: 17 },
    pillars: {
        left: [
            [0, 0],
            [62, 0],
            [20, 450],
            [0, 450],
        ],
        right: [
            [1212, 0],
            [1280, 0],
            [1280, 450],
            [1256, 450],
        ],
    },
};

/** Interior parts used when a car's `cockpit.layout` doesn't say otherwise (the 1987 screenshot). */
export const DEFAULT_PARTS = {
    left: 'vent',
    center: 'none',
    right: 'grille',
    pillars: false,
    cowl: LAYOUT.cowl,
};

/** Rear-view mirror: glass corner radius, housing radius, bezel, taper and the day/night tab. */
export const DEFAULT_MIRROR = { radius: 6, housingRadius: 14, bezel: 9, taper: 0, tab: false };
