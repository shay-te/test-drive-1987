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
};
