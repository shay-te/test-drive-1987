import { SEA_TO_SKY } from './seaToSky.js';

/** Segments in each stage: five equal legs of the highway from Horseshoe Bay to Squamish. */
const LEG = 2140;
/** The first stage's start line on the route; the nodes before it are the road behind the car. */
const FIRST = 50;

/** The five stages up the Sea-to-Sky Highway, northbound from Horseshoe Bay along Howe Sound to
 *  Squamish: each starts where the last ended (`startNode` on the route) and ends at a gas station,
 *  the last in Squamish. Traffic and police rise stage by stage; the late-afternoon sun (`azimuth`
 *  from north, clockwise) sinks in the west over the water. */
export const STAGES = [
    {
        name: 'HORSESHOE BAY',
        seed: 1987,
        route: SEA_TO_SKY,
        startNode: FIRST + 0 * LEG,
        segments: LEG,
        traffic: { sameWay: 1.4, oncoming: 1.5, truckShare: 0.45 },
        traps: 2,
        rock: '#8d8a84',
        rockDark: '#4f4c47',
        vegetation: '#3f5a2e',
        sun: { elevation: 40, azimuth: 245 },
        sky: { turbidity: 1.2, rayleigh: 0.7, mie: 0.003, exposure: 0.5 },
        fog: { color: '#b9cde0', density: 0.000035 },
    },
    {
        name: 'LIONS BAY',
        seed: 4242,
        route: SEA_TO_SKY,
        startNode: FIRST + 1 * LEG,
        segments: LEG,
        traffic: { sameWay: 1.7, oncoming: 1.8, truckShare: 0.4 },
        traps: 2,
        rock: '#878580',
        rockDark: '#4a4844',
        vegetation: '#405c2f',
        sun: { elevation: 35, azimuth: 252 },
        sky: { turbidity: 1.1, rayleigh: 0.6, mie: 0.003, exposure: 0.5 },
        fog: { color: '#bfd3e6', density: 0.000032 },
    },
    {
        name: 'PORTEAU COVE',
        seed: 777,
        route: SEA_TO_SKY,
        startNode: FIRST + 2 * LEG,
        segments: LEG,
        traffic: { sameWay: 2.0, oncoming: 2.1, truckShare: 0.38 },
        traps: 3,
        rock: '#918e87',
        rockDark: '#55524c',
        vegetation: '#3d582c',
        sun: { elevation: 30, azimuth: 258 },
        sky: { turbidity: 1.2, rayleigh: 0.6, mie: 0.003, exposure: 0.5 },
        fog: { color: '#c3d4e4', density: 0.00003 },
    },
    {
        name: 'BRITANNIA BEACH',
        seed: 31337,
        route: SEA_TO_SKY,
        startNode: FIRST + 3 * LEG,
        segments: LEG,
        traffic: { sameWay: 2.2, oncoming: 2.4, truckShare: 0.42 },
        traps: 3,
        rock: '#85827c',
        rockDark: '#4a4742',
        vegetation: '#425d30',
        sun: { elevation: 25, azimuth: 265 },
        sky: { turbidity: 1.8, rayleigh: 0.8, mie: 0.004, exposure: 0.5 },
        fog: { color: '#c9cfd8', density: 0.000035 },
    },
    {
        name: 'SQUAMISH',
        seed: 90210,
        route: SEA_TO_SKY,
        startNode: FIRST + 4 * LEG,
        segments: LEG,
        traffic: { sameWay: 2.4, oncoming: 2.6, truckShare: 0.35 },
        traps: 3,
        rock: '#8a857d',
        rockDark: '#504b44',
        vegetation: '#46602f',
        sun: { elevation: 20, azimuth: 271 },
        sky: { turbidity: 4.5, rayleigh: 2.6, mie: 0.006, exposure: 0.42 },
        fog: { color: '#e2c7a6', density: 0.00004 },
        summit: true,
    },
];
