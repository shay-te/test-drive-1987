/** Geometry of the cabin in car space (metres): x right, y up from the road, z back (forward is -z).
 *  The driver's eye sits at (ROAD.eyeOffset, ROAD.eyeHeight, 0). Proportions follow the 930 blueprint
 *  (1775 mm wide, 1310 mm high) and the owner photo of a 1987 911 Turbo cabin. */
export const CABIN = {
    halfWidth: 0.7,
    floor: 0.2,
    roof: 1.235,
    belt: 0.885,
    windshield: { baseZ: -0.98, baseY: 0.86, topZ: -0.42, topY: 1.215, baseHalf: 0.68, topHalf: 0.58 },
    pillar: { width: 0.07, depth: 0.05 },
    bPillarZ: 0.52,
    doorFrontZ: -0.92,
    rearZ: 1.15,
    // Side profile of the dash, [z, y], from the windshield base round the front face to the firewall.
    dash: [
        [-0.98, 0.86],
        [-0.8, 0.874],
        [-0.675, 0.866],
        [-0.632, 0.84],
        [-0.622, 0.79],
        [-0.62, 0.62],
        [-0.64, 0.6],
        [-0.98, 0.5],
    ],
    // The padded hood over the dials (driver's side only); its ends are rounded the same way.
    hood: {
        x0: -0.69,
        x1: -0.01,
        bevel: 0.04,
        profile: [
            [-0.93, 0.866],
            [-0.84, 0.91],
            [-0.76, 0.941],
            [-0.69, 0.946],
            [-0.645, 0.935],
            [-0.63, 0.919],
            [-0.645, 0.906],
            [-0.7, 0.9],
            [-0.8, 0.875],
        ],
    },
    // Instrument face under the hood: centre, tilt back from vertical, and metres per layout pixel.
    face: { x: -0.36, y: 0.834, z: -0.7, tiltDeg: 20, scale: 0.00074, inset: 0.022 },
    fascia: { y0: 0.655, y1: 0.745, z: -0.617, x0: -0.69, x1: 0.42 },
    knee: { y: 0.625, z: -0.605, radius: 0.032 },
    squareVent: { x: -0.625, y: 0.7, w: 0.08, h: 0.07 },
    louvre: { x: 0.11, y: 0.806, w: 0.2, h: 0.048 },
    radio: { x: 0.08, y: 0.7, w: 0.19, h: 0.052, display: { w: 0.11, h: 0.036, x: -0.035 } },
    switches: [
        [-0.53, 0.705],
        [-0.17, 0.705],
    ],
    console: { x: 0.03, w: 0.24, top: 0.6, bottom: 0.24, front: -0.62, back: -0.36 },
    tunnel: { w: 0.26, h: 0.16, front: -0.62, back: 0.55 },
    wheel: { x: -0.36, y: 0.8, z: -0.4, tiltDeg: 24, radius: 0.19, tube: 0.021, maxTurnDeg: 110 },
    pad: { w: 0.24, h: 0.092, depth: 0.05, dy: -0.012, radius: 0.03, emblemY: 0.32 },
    shifter: { x: 0.02, y: 0.36, z: -0.18, length: 0.32, col: 0.035, row: 0.04, knob: 0.022 },
    seat: { x: 0.36, cushionY: 0.34, backZ: 0.36, backTiltDeg: 14 },
    visor: { x: -0.36, y: 1.205, z: -0.35, w: 0.38, d: 0.16 },
    radar: { x: -0.5, w: 0.12, h: 0.032, d: 0.07, leds: 6, ledGap: 0.011, ledX: 0.0, ledY: -0.005 },
    mirror: { x: 0.0, y: 1.155, z: -0.5, w: 0.235, h: 0.066, bezel: 0.009 },
    bonnet: {
        x0: -0.62,
        x1: 0.62,
        profile: [
            [-0.97, 0.86],
            [-1.4, 0.79],
            [-1.9, 0.7],
            [-2.25, 0.6],
            [-2.3, 0.45],
            [-0.97, 0.45],
        ],
    },
    fenders: { x: 0.64, y: 0.62, z: -1.85, length: 0.62, width: 0.19, height: 0.14 },
    wipers: [
        { pivot: [-0.06, 0.875, -1.02], tip: [-0.6, 0.885, -1.0] },
        { pivot: [0.52, 0.875, -1.02], tip: [-0.02, 0.89, -1.03] },
    ],
};
