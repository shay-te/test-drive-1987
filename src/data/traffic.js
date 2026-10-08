/** Side profiles (metres, front at x = 0): `belt` = window line, `roof` = roof panel. */
const SEDAN_BODY = {
    profile: [
        [0.02, 0.3],
        [0, 0.55],
        [0.08, 0.74],
        [0.9, 0.82],
        [1.5, 0.86],
        [2.05, 1.36],
        [3.2, 1.38],
        [3.75, 0.98],
        [4.72, 0.94],
        [4.8, 0.82],
        [4.79, 0.32],
        [4.7, 0.3],
    ],
    belt: 0.9,
    roof: 1.3,
    wheels: [
        { x: 1.0, r: 0.32 },
        { x: 3.85, r: 0.32 },
    ],
};

/** Other road users. Sizes in metres; speeds in mph as [min, max]. */
export const TRAFFIC_TYPES = {
    sedan: {
        length: 4.8,
        width: 1.8,
        height: 1.38,
        speedMph: [46, 62],
        colors: ['#8b1e24', '#1f3d6b', '#d8d4c8', '#2d2d30', '#6b7b52', '#b48a3c', '#7d8a96'],
        body: SEDAN_BODY,
    },
    wagon: {
        length: 4.9,
        width: 1.8,
        height: 1.45,
        speedMph: [44, 58],
        colors: ['#5a3a22', '#c9c3b3', '#30485e', '#7a2b1f'],
        body: {
            profile: [
                [0.02, 0.3],
                [0, 0.55],
                [0.08, 0.74],
                [0.9, 0.82],
                [1.5, 0.86],
                [2.0, 1.4],
                [4.55, 1.42],
                [4.85, 0.95],
                [4.9, 0.32],
                [4.8, 0.3],
            ],
            belt: 0.9,
            roof: 1.34,
            wheels: [
                { x: 1.0, r: 0.32 },
                { x: 3.9, r: 0.32 },
            ],
        },
    },
    pickup: {
        length: 5.1,
        width: 1.9,
        height: 1.7,
        speedMph: [42, 56],
        colors: ['#a43a1c', '#2b4a2b', '#e0dccf', '#3c3c42'],
        body: {
            profile: [
                [0.02, 0.42],
                [0, 0.62],
                [0.08, 0.98],
                [1.4, 1.04],
                [1.7, 1.08],
                [2.05, 1.68],
                [2.9, 1.7],
                [2.98, 1.06],
                [5.05, 1.06],
                [5.1, 0.42],
                [5.0, 0.4],
            ],
            belt: 1.12,
            roof: 1.62,
            wheels: [
                { x: 1.0, r: 0.38 },
                { x: 4.0, r: 0.38 },
            ],
        },
    },
    van: {
        length: 4.9,
        width: 1.95,
        height: 2.0,
        speedMph: [40, 54],
        colors: ['#f0eee6', '#6d1f1f', '#2a4f73', '#c7a54a'],
        body: {
            profile: [
                [0.02, 0.38],
                [0, 0.62],
                [0.1, 1.0],
                [0.55, 1.12],
                [1.05, 1.92],
                [4.85, 1.98],
                [4.95, 1.9],
                [4.95, 0.4],
                [4.85, 0.38],
            ],
            belt: 1.15,
            roof: 1.9,
            wheels: [
                { x: 0.9, r: 0.34 },
                { x: 3.9, r: 0.34 },
            ],
        },
    },
    truck: {
        length: 14,
        width: 2.5,
        height: 3.9,
        speedMph: [34, 50],
        colors: ['#2c54a8', '#c0392b', '#e8e6df', '#2f6b3a', '#d98e1c'],
        semi: true,
    },
    police: {
        length: 5.0,
        width: 1.9,
        height: 1.45,
        speedMph: [0, 0],
        colors: ['#f4f4f0'],
        body: SEDAN_BODY,
        lightBar: true,
    },
};

/** Car-like types picked for ordinary traffic. */
export const CIVILIAN_TYPES = ['sedan', 'sedan', 'wagon', 'pickup', 'van'];
