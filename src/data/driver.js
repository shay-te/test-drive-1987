/** The driver seen in the cabin: build, where the seat, shoulders and pedals are from the seated eye
 *  (car space: x right, y up, z back; across is towards the driver's own right), and clothes. */
export const DRIVER = {
    shoulder: { across: 0.19, down: 0.27, back: 0.04 },
    // The seat's hip (H-)point.
    hip: { across: 0.1, down: 0.72, back: 0.16 },
    upperArm: 0.32,
    // Elbow to wrist.
    forearm: 0.27,
    // An arm reaches this share of its length before the shoulder leans in after the target.
    straightArm: 0.97,
    thigh: 0.47,
    shin: 0.47,
    // Pedal faces: ahead of and below the eye; across for the clutch, brake and throttle, and where
    // the left foot rests off the clutch. A pedal pressed home travels `travel`.
    pedals: { ahead: 0.84, down: 0.62, clutch: -0.17, brake: -0.02, throttle: 0.13, rest: -0.3, travel: 0.07 },
    // The ankle sits this far above and behind the ball of the foot on the pedal.
    ankle: { up: 0.07, back: 0.12 },
    // Where elbows and knees bend towards, from the shoulder or hip.
    elbowPole: [1, -0.6, 0.2],
    kneePole: [0.15, 1, -0.6],
    // Hands hold the rim this far in from its outer edge, at quarter to three, and turn with the wheel
    // this far before sliding round it (a keyboard turns the wheel to full lock).
    rimInset: 0.015,
    gripTurnDeg: 45,
    radius: { upperArm: 0.048, forearm: 0.042, thigh: 0.075, shin: 0.055, neck: 0.055 },
    // The gloved hand: the palm's width across the knuckles, length from wrist to knuckles and thickness;
    // each finger's place across the palm (+ towards the index side), bone lengths and radius, index
    // first; the thumb's, its root this share of the palm back from the knuckles; where the fingers'
    // metacarpal joints lie, this share of the way from the wrist to the knuckles; the palm on the rim
    // tilted towards the driver (driver-ward share of its outward lean); the bars it holds (m).
    hand: {
        palm: [0.084, 0.095, 0.03],
        fingers: [
            { across: 0.031, bones: [0.044, 0.026, 0.021], radius: 0.0095 },
            { across: 0.0105, bones: [0.048, 0.029, 0.022], radius: 0.0098 },
            { across: -0.0105, bones: [0.045, 0.027, 0.021], radius: 0.0093 },
            { across: -0.031, bones: [0.035, 0.021, 0.019], radius: 0.0085 },
        ],
        thumb: { across: 0.045, root: 0.6, bones: [0.04, 0.032, 0.027], radius: 0.0105, start: 0.6 },
        metacarpal: 0.33,
        /** The rigged hand's own build, slimmed: across each bone and through it (back to palm). */
        girth: [0.84, 0.72],
        rimTilt: 0.8,
        knobTilt: 0.35,
        rim: 0.016,
        knob: 0.021,
    },
    foot: [0.1, 0.08, 0.27],
    // The shoe's centre sits this share of its length behind the ball of the foot.
    footShift: -0.25,
    // Head radii (across, up, back) and its centre from the eye; hair covers its top and back.
    head: { radii: [0.078, 0.11, 0.098], up: 0.02, back: 0.075 },
    hair: { grow: 1.07, up: 0.018, back: 0.014 },
    // Torso width and depth; it rises this far above the shoulder joints.
    torso: [0.4, 0.24],
    shoulderRise: 0.07,
    /** Rigged hands (WebXR's generic hand, MIT), posed joint by joint from the hand pose. */
    handModels: { left: 'assets/models/driver/hand-left.glb', right: 'assets/models/driver/hand-right.glb' },
    colors: {
        jacket: '#2f4058', gloves: '#9a7650', trousers: '#2a2a30', shoes: '#111111', skin: '#c49b7c', hair: '#3a2a1e',
    },
    roughness: 0.85,
    // How fast hands and feet move (1/s), how far the hand gets before the knob moves with it, and how
    // long it stays on the knob after a shift (s).
    motion: { hand: 14, foot: 16, pedal: 22, grip: 0.85, hold: 0.25 },
};
