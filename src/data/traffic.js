/** Other road users, each an authored model (assets/models/<type>/model.glb) scaled to its real length.
 *  Sizes in metres, taken from the model's body without mirrors so collisions match what is drawn;
 *  kerb masses in kg (a crash throws the lighter car further); speeds in mph as [min, max]. */
export const TRAFFIC_TYPES = {
    // A 1978 Lincoln Continental Mark V.
    continental: {
        length: 5.85,
        width: 2.02,
        height: 1.34,
        massKg: 2100,
        speedMph: [46, 62],
        model: 'assets/models/continental/model.glb',
    },
    // A 1968 Volkswagen Beetle.
    beetle: {
        length: 4.08,
        width: 1.59,
        height: 1.47,
        massKg: 840,
        speedMph: [40, 54],
        model: 'assets/models/beetle/model.glb',
    },
    // A 1968 Volkswagen Beetle in yellow.
    bumblebee: {
        length: 4.08,
        width: 1.58,
        height: 1.47,
        massKg: 840,
        speedMph: [40, 54],
        model: 'assets/models/bumblebee/model.glb',
    },
    // A 1987 Mazda RX-7 (FC).
    rx7: {
        length: 4.29,
        width: 1.76,
        height: 1.27,
        massKg: 1220,
        speedMph: [50, 66],
        model: 'assets/models/rx7/model.glb',
    },
    // A lifted 1990 full-size pickup on big tyres.
    pickup: {
        length: 5.4,
        width: 2.42,
        height: 2.1,
        massKg: 1950,
        speedMph: [42, 56],
        model: 'assets/models/pickup/model.glb',
    },
    // A 1990 Ford Aerostar.
    van: {
        length: 4.44,
        width: 1.86,
        height: 1.82,
        massKg: 1560,
        speedMph: [40, 54],
        model: 'assets/models/van/model.glb',
    },
    // A Mack MR refuse truck: slow, and slower still up the grade.
    truck: {
        length: 9.3,
        width: 2.95,
        height: 3.95,
        massKg: 12000,
        speedMph: [34, 50],
        model: 'assets/models/truck/model.glb',
    },
    // A 2001 Crown Victoria Police Interceptor (5385 x 1987 x 1440 mm).
    police: {
        length: 5.385,
        width: 1.987,
        height: 1.44,
        massKg: 1800,
        speedMph: [0, 0],
        model: 'assets/models/police/model.glb',
        // The model's light bar lenses, split by colour so the runtime can flash them.
        lightBar: { red: 'light_red', blue: 'light_blue' },
    },
};

/** Car-like types picked for ordinary traffic (repeats weight the pick). */
export const CIVILIAN_TYPES = ['continental', 'continental', 'beetle', 'bumblebee', 'rx7', 'pickup', 'van'];
