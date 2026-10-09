/** The 1987 line-up. Porsche brochure text is from the original game, the others are period road
 *  tests; gearing/tyres are the real cars'. `sound.firing` = firing angle per cylinder (720° cycle). */

const flat6Firing = { 1: 0, 6: 120, 2: 240, 4: 360, 3: 480, 5: 600 };
const v8CrossPlaneFiring = { 1: 0, 8: 90, 4: 180, 3: 270, 6: 360, 5: 450, 7: 540, 2: 630 };

/** Converts a {cylinder: angle} map to an array indexed by cylinder-1. */
const firingArray = (map) => {
    return Object.keys(map)
        .map(Number)
        .sort((a, b) => {
            return a - b;
        })
        .map((c) => {
            return map[c];
        });
};

/** Even-firing engine with `n` cylinders alternating between two banks. */
const evenFiring = (n) => {
    return Array.from({ length: n }, (_, i) => {
        return (i * 720) / n;
    });
};
const alternatingBanks = (n) => {
    return Array.from({ length: n }, (_, i) => {
        return i % 2;
    });
};

export const CARS = [
    {
        id: 'porsche',
        make: 'PORSCHE',
        model: '911 TURBO',
        fullName: 'Porsche 911 Turbo',
        paint: '#c4c8cc',
        brochure: {
            specs: {
                layout: 'rear/rear',
                engineType: 'turbo sohc flat-6',
                displacement: '3299cc',
                compression: '7.0:1',
                power: '282 @ 5500',
                torque: '278 @ 4000',
                transmission: '4 sp manual',
                braking: '245ft.',
            },
            tires: ['Dunlop SP Super Sport D4,', '205/55VR-16 front/', '245/45VR-16 rear'],
            price: '$50,000',
            zeroToSixty: '5.0s',
            zeroToHundred: '12.8s',
            quarterMile: '13.4s',
            quarterMileSpeed: '@ 103mph',
            topSpeed: '153mph',
            lbPerBhp: '11.4',
            lateral: '0.84g',
        },
        engine: {
            hp: 282,
            hpRpm: 5500,
            torque: 278,
            torqueRpm: 4000,
            idleRpm: 950,
            redline: 6800,
            maxRpm: 7600,
            // KKK K27 at 0.8 bar (11.6 psi) peak boost.
            turbo: { spoolRpm: 2700, fullRpm: 4300, lagSec: 0.95, offBoost: 0.55, peakPsi: 11.6 },
        },
        drivetrain: {
            // The 930/36 gearbox (1986-88): reverse 39:16.
            gears: [2.25, 1.304, 0.893, 0.625],
            reverse: 2.4375,
            finalDrive: 4.222,
            tireRadius: 0.312,
            efficiency: 0.86,
        },
        chassis: {
            massKg: 1458,
            wheelbase: 2.272,
            frontWeight: 0.39,
            cgHeight: 0.48,
            grip: 0.84,
            driven: 'rear',
        },
        targets: { topMph: 153, zeroToSixty: 5.0, zeroToHundred: 12.8, quarterMile: 13.4, trapMph: 103 },
        sound: {
            cylinders: 6,
            firing: firingArray(flat6Firing),
            banks: [0, 0, 0, 1, 1, 1],
            pulseMs: 2.3,
            resonances: [
                [95, 2.2, 1.0],
                [380, 3.0, 0.55],
                [1250, 4.0, 0.22],
            ],
            pipeMs: [3.9, 4.3],
            bankBlend: 0.65,
            rasp: 0.32,
            intake: 0.22,
            mechanical: 0.18,
            fan: 0.12,
            muffle: 0.62,
            overrunPops: 0.08,
            turbo: { whistle: 0.045, whistleHz: 5200, flutter: 0.5, blowoff: 0 },
            cabin: 'rear',
        },
        cockpit: {
            cluster: 'porsche',
            model: 'assets/models/porsche/cabin.glb',
            dash: { top: '#a4a5a2', face: '#959693', panel: '#141415', accent: '#2c2c2e', grain: 'leather' },
            wheel: { spokes: 4, hub: 'pad', rim: '#141414', spoke: '#1b1b1d', marker: false, emblem: 'make' },
            shifter: { type: 'boot', pattern: 'porsche4', knob: '#1a1a1a' },
        },
        body: {
            // Licence plate mounts in car space, measured on the model: centre, facing out, size (m).
            plates: [{ at: [0, 0.436, 1.884], facing: [0, 0, 1], size: [0.267, 0.109] }, { at: [0, 0.258, -2.268], facing: [0, 0, -1], size: [0.266, 0.112] }],
            length: 4.29,
            width: 1.775,
            // The driver's eye, metres back from the front bumper.
            eye: 2.34,
            height: 1.31,
            // Axles and overall size from the 930 3.3 blueprint (4291 x 1775 x 1310 mm, 2272 wheelbase).
            wheels: [
                { x: 0.95, r: 0.31 },
                { x: 3.22, r: 0.31 },
            ],
            // Side view traced from the 930 3.3 blueprint: high wings over the round headlamps, the
            // fastback roof running into the engine lid, the tea-tray wing with its rubber lip.
            profile: [
                [0.07, 0.24],
                [0.0, 0.32],
                [0.0, 0.52],
                [0.05, 0.565],
                [0.14, 0.585],
                [0.2, 0.64],
                [0.26, 0.74],
                [0.33, 0.815],
                [0.42, 0.85],
                [0.6, 0.86],
                [0.95, 0.865],
                [1.2, 0.9],
                [1.42, 0.955],
                [1.7, 1.13],
                [1.92, 1.255],
                [2.15, 1.3],
                [2.38, 1.31],
                [2.65, 1.285],
                [2.95, 1.2],
                [3.25, 1.07],
                [3.52, 1.0],
                [3.62, 1.0],
                [4.2, 1.025],
                [4.28, 1.04],
                [4.29, 0.98],
                [4.27, 0.86],
                [4.24, 0.8],
                [4.24, 0.62],
                [4.29, 0.58],
                [4.29, 0.34],
                [4.22, 0.25],
            ],
            smooth: 0.18,
            glass: [
                [1.48, 0.985],
                [1.9, 1.225],
                [2.3, 1.265],
                [2.7, 1.245],
                [2.98, 1.13],
                [3.07, 1.04],
                [2.99, 0.995],
            ],
            pillars: [2.46],
            doorLines: [1.5, 2.56],
            waistLine: 0.98,
            spoiler: [
                [3.56, 1.0],
                [4.2, 1.025],
                [4.285, 1.04],
                [4.29, 0.98],
                [4.27, 0.87],
                [3.95, 0.88],
                [3.6, 0.96],
            ],
            flare: { x0: 2.62, x1: 3.98, y: 0.8 },
            // Black accordion bellows where the impact bumpers meet the body.
            bellows: [
                { x0: 0.16, x1: 0.22, y0: 0.36, y1: 0.52 },
                { x0: 4.02, x1: 4.08, y0: 0.37, y1: 0.54 },
            ],
            mirror: [1.62, 1.04],
            headlamp: 'round',
            rim: 'fuchs',
            lights: { head: [0.29, 0.77], tail: [4.26, 0.72] },
        },
    },
    {
        id: 'ferrari',
        make: 'FERRARI',
        model: 'TESTAROSSA',
        fullName: 'Ferrari Testarossa',
        paint: '#cc1517',
        brochure: {
            specs: {
                layout: 'mid/rear',
                engineType: 'dohc 48v flat-12',
                displacement: '4942cc',
                compression: '9.2:1',
                power: '380 @ 5750',
                torque: '354 @ 4500',
                transmission: '5 sp manual',
                braking: '232ft.',
            },
            tires: ['Goodyear Eagle VR,', '225/50VR-16 front/', '255/50VR-16 rear'],
            price: '$105,000',
            zeroToSixty: '5.3s',
            zeroToHundred: '11.9s',
            quarterMile: '13.6s',
            quarterMileSpeed: '@ 105mph',
            topSpeed: '181mph',
            lbPerBhp: '9.6',
            lateral: '0.85g',
        },
        engine: {
            hp: 380,
            hpRpm: 5750,
            torque: 354,
            torqueRpm: 4500,
            idleRpm: 1000,
            redline: 6800,
            maxRpm: 7700,
        },
        drivetrain: {
            gears: [3.139, 2.104, 1.526, 1.167, 0.875],
            reverse: 2.523,
            finalDrive: 3.21,
            tireRadius: 0.33,
            efficiency: 0.85,
        },
        chassis: {
            massKg: 1660,
            wheelbase: 2.55,
            frontWeight: 0.41,
            cgHeight: 0.45,
            grip: 0.85,
            driven: 'rear',
        },
        targets: { topMph: 181, zeroToSixty: 5.3, zeroToHundred: 11.9, quarterMile: 13.6, trapMph: 105 },
        sound: {
            cylinders: 12,
            firing: evenFiring(12),
            banks: alternatingBanks(12),
            pulseMs: 1.45,
            resonances: [
                [140, 2.5, 0.9],
                [610, 3.2, 0.7],
                [2100, 4.5, 0.35],
            ],
            pipeMs: [2.9, 3.05],
            bankBlend: 0.5,
            rasp: 0.24,
            intake: 0.36,
            mechanical: 0.3,
            fan: 0,
            muffle: 0.38,
            overrunPops: 0.12,
            turbo: null,
            cabin: 'mid',
        },
        cockpit: {
            cluster: 'ferrari',
            model: 'assets/models/ferrari/cabin.glb',
            dash: { top: '#1b1a19', face: '#c9a27a', panel: '#b8916a', accent: '#2a2725', grain: 'leather' },
            wheel: { spokes: 3, rim: '#141414', spoke: '#a8a8ad' },
            shifter: { type: 'gate', pattern: 'dogleg5', knob: '#111111' },
        },
        body: {
            // Licence plate mounts in car space, measured on the model: centre, facing out, size (m).
            plates: [{ at: [0, 0.44, 1.985], facing: [0.006, -0.211, 0.977], size: [0.305, 0.152] }],
            length: 4.485,
            width: 1.976,
            // The driver's eye, metres back from the front bumper.
            eye: 2.44,
            height: 1.13,
            // Axles of the authored model (wheelbase 2.56).
            wheels: [
                { x: 1.1, r: 0.32 },
                { x: 3.66, r: 0.33 },
            ],
            profile: [
                [0.05, 0.24],
                [0.0, 0.38],
                [0.04, 0.5],
                [0.6, 0.6],
                [1.2, 0.68],
                [1.62, 0.74],
                [2.15, 1.1],
                [2.42, 1.13],
                [2.82, 1.11],
                [3.4, 0.93],
                [4.0, 0.87],
                [4.45, 0.86],
                [4.485, 0.75],
                [4.47, 0.36],
                [4.4, 0.24],
            ],
            glass: [
                [1.7, 0.78],
                [2.16, 1.06],
                [2.74, 1.07],
                [3.0, 0.9],
                [2.95, 0.8],
            ],
            pillars: [],
            doorLines: [1.72, 2.92],
            strakes: { x0: 2.25, x1: 3.2, y0: 0.4, y1: 0.7, count: 5 },
            mirror: [2.12, 1.02],
            crease: 0.66,
            rim: 'star',
            lights: { head: [0.12, 0.5], tail: [4.47, 0.7] },
        },
    },
    {
        id: 'lamborghini',
        make: 'LAMBORGHINI',
        model: 'COUNTACH',
        fullName: 'Lamborghini Countach 5000 S QV',
        paint: '#b0141c',
        brochure: {
            specs: {
                layout: 'mid/rear',
                engineType: 'dohc 48v V-12',
                displacement: '5167cc',
                compression: '9.5:1',
                power: '420 @ 7000',
                torque: '341 @ 5200',
                transmission: '5 sp manual',
                braking: '236ft.',
            },
            tires: ['Pirelli P7,', '225/50VR-15 front/', '345/35VR-15 rear'],
            price: '$135,000',
            zeroToSixty: '5.2s',
            zeroToHundred: '11.2s',
            quarterMile: '13.3s',
            quarterMileSpeed: '@ 107mph',
            topSpeed: '173mph',
            lbPerBhp: '8.0',
            lateral: '0.88g',
        },
        engine: {
            hp: 420,
            hpRpm: 7000,
            torque: 341,
            torqueRpm: 5200,
            idleRpm: 1050,
            redline: 7500,
            maxRpm: 8300,
        },
        drivetrain: {
            gears: [2.232, 1.625, 1.086, 0.858, 0.707],
            reverse: 1.96,
            finalDrive: 4.091,
            tireRadius: 0.311,
            efficiency: 0.85,
        },
        chassis: {
            massKg: 1520,
            wheelbase: 2.45,
            frontWeight: 0.42,
            cgHeight: 0.43,
            grip: 0.88,
            driven: 'rear',
        },
        targets: { topMph: 173, zeroToSixty: 5.2, zeroToHundred: 11.2, quarterMile: 13.3, trapMph: 107 },
        sound: {
            cylinders: 12,
            firing: evenFiring(12),
            banks: alternatingBanks(12),
            pulseMs: 1.6,
            resonances: [
                [118, 2.0, 1.0],
                [530, 2.8, 0.75],
                [1850, 3.5, 0.45],
            ],
            pipeMs: [2.6, 3.3],
            bankBlend: 0.45,
            rasp: 0.48,
            intake: 0.75,
            mechanical: 0.36,
            fan: 0,
            muffle: 0.32,
            overrunPops: 0.32,
            turbo: null,
            cabin: 'mid',
        },
        cockpit: {
            cluster: 'lamborghini',
            model: 'assets/models/lamborghini/cabin.glb',
            dash: { top: '#141414', face: '#232323', panel: '#1d1d1d', accent: '#5a1a14', grain: 'leather' },
            wheel: { spokes: 3, rim: '#121212', spoke: '#1e1e1e' },
            shifter: { type: 'gate', pattern: 'dogleg5', knob: '#cfcfd4' },
        },
        body: {
            // Licence plate mounts in car space, measured on the model: centre, facing out, size (m).
            plates: [{ at: [0, 0.422, 1.839], facing: [0, 0, 1], size: [0.52, 0.11] }, { at: [0, 0.325, -2.147], facing: [0, 0, -1], size: [0.45, 0.095] }],
            length: 4.14,
            width: 2.0,
            // The driver's eye, metres back from the front bumper.
            eye: 2.15,
            height: 1.07,
            // Axles of the authored model (wheelbase 2.41).
            wheels: [
                { x: 0.91, r: 0.31 },
                { x: 3.32, r: 0.315 },
            ],
            profile: [
                [0.03, 0.24],
                [0.0, 0.35],
                [0.06, 0.45],
                [1.4, 0.72],
                [2.06, 1.05],
                [2.3, 1.07],
                [2.62, 1.06],
                [2.66, 1.1],
                [3.0, 1.1],
                [3.05, 1.02],
                [3.45, 0.88],
                [4.12, 0.84],
                [4.14, 0.76],
                [4.12, 0.4],
                [4.04, 0.25],
            ],
            glass: [
                [1.62, 0.79],
                [2.07, 1.02],
                [2.56, 1.03],
                [2.6, 0.81],
            ],
            pillars: [],
            doorLines: [1.62, 2.66],
            arches: 'angular',
            wing: [
                [3.35, 1.05],
                [3.42, 1.13],
                [4.12, 1.15],
                [4.14, 1.09],
                [3.5, 1.06],
            ],
            naca: [2.05, 0.6],
            mirror: [1.92, 0.95],
            crease: 0.66,
            rim: 'dial',
            lights: { head: [0.1, 0.44], tail: [4.12, 0.72] },
        },
    },
    {
        id: 'lotus',
        make: 'LOTUS',
        model: 'ESPRIT TURBO',
        fullName: 'Lotus Esprit Turbo',
        paint: '#d42a1a',
        brochure: {
            specs: {
                layout: 'mid/rear',
                engineType: 'turbo dohc inline-4',
                displacement: '2174cc',
                compression: '8.0:1',
                power: '215 @ 6000',
                torque: '220 @ 4250',
                transmission: '5 sp manual',
                braking: '249ft.',
            },
            tires: ['Goodyear Eagle VR,', '195/60VR-15 front/', '235/60VR-15 rear'],
            price: '$55,000',
            zeroToSixty: '5.4s',
            zeroToHundred: '14.6s',
            quarterMile: '14.0s',
            quarterMileSpeed: '@ 99mph',
            topSpeed: '152mph',
            lbPerBhp: '12.8',
            lateral: '0.86g',
        },
        engine: {
            hp: 215,
            hpRpm: 6000,
            torque: 220,
            torqueRpm: 4250,
            idleRpm: 900,
            redline: 7000,
            maxRpm: 7800,
            // Garrett T3 at 0.55 bar (8 psi) peak boost.
            turbo: { spoolRpm: 2600, fullRpm: 4000, lagSec: 0.7, offBoost: 0.6, peakPsi: 8 },
        },
        drivetrain: {
            // The Citroën SM gearbox: reverse 41:13.
            gears: [2.92, 1.94, 1.32, 0.97, 0.76],
            reverse: 3.154,
            finalDrive: 4.375,
            tireRadius: 0.331,
            efficiency: 0.86,
        },
        chassis: {
            massKg: 1250,
            wheelbase: 2.44,
            frontWeight: 0.42,
            cgHeight: 0.44,
            grip: 0.86,
            driven: 'rear',
        },
        targets: { topMph: 152, zeroToSixty: 5.4, zeroToHundred: 14.6, quarterMile: 14.0, trapMph: 99 },
        sound: {
            cylinders: 4,
            firing: [0, 540, 180, 360],
            banks: [0, 0, 0, 0],
            pulseMs: 2.7,
            resonances: [
                [105, 2.0, 1.0],
                [440, 2.6, 0.6],
                [1500, 3.5, 0.3],
            ],
            pipeMs: [3.4, 3.4],
            bankBlend: 1,
            rasp: 0.44,
            intake: 0.3,
            mechanical: 0.26,
            fan: 0,
            muffle: 0.55,
            overrunPops: 0.1,
            turbo: { whistle: 0.06, whistleHz: 6200, flutter: 0, blowoff: 0.55 },
            cabin: 'mid',
        },
        cockpit: {
            // The cockpit in the reference screenshot of the original game.
            cluster: 'lotus',
            model: 'assets/models/lotus/cabin.glb',
            dash: { top: '#6e6e70', face: '#9c9c9e', panel: '#8d8d90', accent: '#4a4a4c', grain: 'vinyl' },
            wheel: { spokes: 2, rim: '#141414', spoke: '#1c1c1c' },
            shifter: { type: 'boot', pattern: 'h5', knob: '#141414' },
        },
        body: {
            // Licence plate mounts in car space, measured on the model: centre, facing out, size (m).
            plates: [{ at: [0, 0.65, 1.823], facing: [0, 0.342, 0.94], size: [0.49, 0.145] }],
            length: 4.19,
            width: 1.86,
            // The driver's eye, metres back from the front bumper.
            eye: 2.25,
            height: 1.11,
            // Axles of the authored model (wheelbase 2.47).
            wheels: [
                { x: 0.93, r: 0.31 },
                { x: 3.4, r: 0.33 },
            ],
            profile: [
                [0.02, 0.25],
                [0.0, 0.42],
                [0.1, 0.55],
                [1.45, 0.73],
                [2.05, 1.08],
                [2.25, 1.11],
                [2.66, 1.1],
                [3.7, 0.93],
                [4.08, 0.89],
                [4.15, 0.94],
                [4.19, 0.86],
                [4.18, 0.4],
                [4.1, 0.25],
            ],
            glass: [
                [1.64, 0.8],
                [2.06, 1.05],
                [2.6, 1.07],
                [2.84, 0.84],
            ],
            pillars: [],
            doorLines: [1.66, 2.86],
            louvres: { x0: 2.95, x1: 3.55, y0: 0.84, y1: 1.0, count: 5 },
            waistLine: 0.55,
            crease: 0.66,
            rim: 'cross',
            lights: { head: [0.08, 0.5], tail: [4.18, 0.74] },
        },
    },
    {
        id: 'corvette',
        make: 'CHEVROLET',
        model: 'CORVETTE',
        fullName: 'Chevrolet Corvette',
        paint: '#f2c21a',
        brochure: {
            specs: {
                layout: 'front/rear',
                engineType: 'ohv V-8, port inj.',
                displacement: '5733cc',
                compression: '9.5:1',
                power: '240 @ 4000',
                torque: '345 @ 3200',
                transmission: '4 sp + overdrive',
                braking: '221ft.',
            },
            tires: ['Goodyear Eagle VR50,', '255/50VR-16 front/', '255/50VR-16 rear'],
            price: '$35,000',
            zeroToSixty: '5.8s',
            zeroToHundred: '14.6s',
            quarterMile: '14.3s',
            quarterMileSpeed: '@ 96mph',
            topSpeed: '154mph',
            lbPerBhp: '13.5',
            lateral: '0.90g',
        },
        engine: {
            hp: 240,
            hpRpm: 4000,
            torque: 345,
            torqueRpm: 3200,
            idleRpm: 700,
            redline: 5000,
            maxRpm: 5800,
        },
        drivetrain: {
            gears: [2.88, 1.91, 1.33, 1.0, 0.67],
            reverse: 2.78,
            finalDrive: 3.07,
            tireRadius: 0.33,
            efficiency: 0.85,
            gearLabels: ['1', '2', '3', '4', 'OD'],
        },
        chassis: {
            massKg: 1470,
            wheelbase: 2.44,
            frontWeight: 0.51,
            cgHeight: 0.46,
            grip: 0.9,
            driven: 'rear',
        },
        targets: { topMph: 154, zeroToSixty: 5.8, zeroToHundred: 14.6, quarterMile: 14.3, trapMph: 96 },
        sound: {
            cylinders: 8,
            firing: firingArray(v8CrossPlaneFiring),
            banks: [0, 1, 0, 1, 0, 1, 0, 1],
            pulseMs: 3.3,
            resonances: [
                [68, 1.8, 1.0],
                [255, 2.4, 0.65],
                [880, 3.0, 0.25],
            ],
            pipeMs: [5.6, 6.3],
            bankBlend: 0.22,
            rasp: 0.3,
            intake: 0.24,
            mechanical: 0.16,
            fan: 0,
            muffle: 0.66,
            overrunPops: 0.18,
            turbo: null,
            cabin: 'front',
        },
        cockpit: {
            cluster: 'corvette',
            model: 'assets/models/corvette/cabin.glb',
            dash: { top: '#1e1f22', face: '#3a3b3f', panel: '#2e2f33', accent: '#55575c', grain: 'plastic' },
            wheel: { spokes: 2, rim: '#191919', spoke: '#2a2a2c' },
            shifter: { type: 'boot', pattern: 'overdrive', knob: '#1b1b1b' },
        },
        body: {
            // Licence plate mounts in car space, measured on the model: centre, facing out, size (m).
            plates: [{ at: [0, 0.592, 1.495], facing: [0, 0.168, 0.986], size: [0.305, 0.152] }],
            length: 4.48,
            width: 1.806,
            // The driver's eye, metres back from the front bumper.
            eye: 2.93,
            height: 1.18,
            // Axles of the authored model (wheelbase 2.38).
            wheels: [
                { x: 1.08, r: 0.32 },
                { x: 3.46, r: 0.33 },
            ],
            profile: [
                [0.04, 0.27],
                [0.0, 0.4],
                [0.08, 0.54],
                [0.8, 0.69],
                [1.62, 0.8],
                [1.78, 0.83],
                [2.27, 1.16],
                [2.47, 1.18],
                [2.88, 1.16],
                [3.55, 1.0],
                [4.02, 0.93],
                [4.4, 0.9],
                [4.48, 0.8],
                [4.47, 0.4],
                [4.4, 0.27],
            ],
            glass: [
                [1.84, 0.86],
                [2.27, 1.12],
                [2.86, 1.13],
                [3.46, 0.98],
                [3.52, 0.87],
            ],
            pillars: [2.86],
            doorLines: [1.84, 2.84],
            molding: { y0: 0.4, y1: 0.46 },
            gills: { x: 1.5, y0: 0.5, y1: 0.66, count: 4 },
            crease: 0.66,
            rim: 'turbine',
            lights: { head: [0.1, 0.5], tail: [4.47, 0.74] },
        },
    },
];

export const carById = (id) => {
    return (
        CARS.find((c) => {
            return c.id === id;
        }) ?? CARS[0]
    );
};

/** The car `step` places along the line-up from `car`, wrapping round at either end. */
export const neighbourCar = (car, step) => {
    return CARS[(CARS.indexOf(car) + step + CARS.length) % CARS.length];
};

/** Only cars with an authored model can be driven; the rest are shown locked. */
export const isLocked = (car) => {
    return !car.cockpit.model;
};

/** Display label of a gear index (0 = neutral, below it reverse). */
export function gearLabel(car, gear) {
    if (gear < 0) return 'R';
    if (gear === 0) return 'N';
    return car.drivetrain.gearLabels?.[gear - 1] ?? String(gear);
}
