/** The coastal forest along the Sea-to-Sky route, as the Lions Bay Community Wildfire Protection Plan
 *  surveyed it (B.A. Blackwell & Associates, 2007): the Coastal Western Hemlock zone, over 80%
 *  coniferous (Douglas-fir, western hemlock, western redcedar, amabilis fir), red alder on moist rich
 *  sites and with bigleaf maple in mixed stands, amabilis fir and hemlock higher up. */

/** How each species grows (src/world/conifer.js). A conifer's crown is `whorls` rings of `branches`
 *  sprays from `crownBase` of its height to the top, reaching `spread` of its height at its base and
 *  narrowing by `taper`, drooping by up to `droop` rad and turning back up by `upturn` (rad) at the
 *  tips; `leader` bends its top over (rad), `flare` widens the trunk's foot (share of its radius). A
 *  broadleaf crown fills an ellipsoid `crown` [width, height] (shares of the tree's height) above
 *  `crownBase`: `limbs` main limbs fork from the trunk there, each with `branches` branches out to the
 *  crown's edge carrying `sprays` leafy sprays `reach` of the crown's width long, drooping `droop`
 *  (rad) at the tips, with leaves `leaf` of a spray's length. `spray` is a spray's width (share of its
 *  length); colours run from the shaded inside of the foliage to its fresh tips. */
export const SPECIES = {
    douglasFir: {
        kind: 'conifer', whorls: 15, branches: 6, crownBase: 0.42, spread: 0.13, taper: 0.85, droop: 0.12, upturn: 0.35, leader: 0, flare: 0.25,
        spray: 0.75, foliage: ['#1d3720', '#284826', '#34572e', '#486c38'], bark: '#4a3b30', needle: 0.07,
    },
    westernHemlock: {
        kind: 'conifer', whorls: 17, branches: 7, crownBase: 0.3, spread: 0.12, taper: 0.95, droop: 0.55, upturn: 0.05, leader: 0.7, flare: 0.2,
        spray: 0.85, foliage: ['#284628', '#345a30', '#426c38', '#577f44'], bark: '#4d3d33', needle: 0.04,
    },
    westernRedcedar: {
        kind: 'conifer', whorls: 13, branches: 6, crownBase: 0.25, spread: 0.15, taper: 0.8, droop: 0.75, upturn: 0.7, leader: 0.2, flare: 0.8,
        spray: 0.95, foliage: ['#35532a', '#45672f', '#577b35', '#6b8f3e'], bark: '#7a4b35', needle: 0.035,
    },
    amabilisFir: {
        kind: 'conifer', whorls: 17, branches: 6, crownBase: 0.3, spread: 0.1, taper: 1, droop: 0.08, upturn: 0.12, leader: 0, flare: 0.15,
        spray: 0.7, foliage: ['#142c1b', '#1c3a23', '#26482b', '#335834'], bark: '#87877f', needle: 0.06,
    },
    redAlder: {
        kind: 'broadleaf', limbs: 4, branches: 8, sprays: 5, crownBase: 0.35, crown: [0.26, 0.55], reach: 0.36, droop: 0.5, spray: 0.75, flare: 0.2,
        foliage: ['#304d20', '#41622a', '#527733', '#6a8d3d'], bark: '#9a988f', leaf: 0.1,
    },
    bigleafMaple: {
        kind: 'broadleaf', limbs: 5, branches: 8, sprays: 5, crownBase: 0.28, crown: [0.36, 0.6], reach: 0.33, droop: 0.6, spray: 0.8, flare: 0.35,
        foliage: ['#38561f', '#4b6d28', '#618230', '#7f973c'], bark: '#5b6743', leaf: 0.17,
    },
};

/** The stand types of the plan's survey (its fuel types), each with its share of the forest, its mix
 *  of species, how tall its trees stand (m) and how many stems it has a hectare. */
export const STANDS = [
    { name: 'mature', share: 0.55, heights: [30, 40], stems: 800, species: { douglasFir: 0.4, westernHemlock: 0.3, westernRedcedar: 0.25, amabilisFir: 0.05 } },
    { name: 'young', share: 0.18, heights: [20, 33], stems: 950, species: { douglasFir: 0.45, westernHemlock: 0.4, westernRedcedar: 0.15 } },
    { name: 'alder', share: 0.15, heights: [15, 25], stems: 800, species: { redAlder: 0.85, bigleafMaple: 0.1, westernRedcedar: 0.05 } },
    { name: 'mixed', share: 0.12, heights: [20, 35], stems: 700, species: { douglasFir: 0.3, westernRedcedar: 0.3, redAlder: 0.25, bigleafMaple: 0.15 } },
];

/** Above `above` m the forest is the wetter montane one: amabilis fir and hemlock, shorter. */
export const HIGHLAND = { above: 900, heights: [15, 30], species: { amabilisFir: 0.6, westernHemlock: 0.4 } };

export const FOREST = {
    /** Stands are patches about this wide (m); by the road (disturbed, sunny) alder stands are this
     *  many times as common. */
    standSize: 180,
    roadsideAlder: 1.5,
    /** The canopy trees drawn a hectare (of a stand's stems): within `roadsideReach` m of the road, and
     *  beyond it up to each distance from the road (m). With crowns of these sizes they close the canopy. */
    density: { roadside: 90, roadsideReach: 60, land: [[300, 45], [1200, 10]] },
    /** No trees grow above this height (m) or on ground steeper than LAND_DETAIL.bareRock allows. */
    treeLine: 1500,
    /** Within `near` m of the car trees are drawn branch by branch, beyond as crossed silhouette cards;
     *  the near set is gathered again whenever the car crosses into another `cell` m square. */
    near: 260,
    cell: 100,
    /** Each tree's colour is brightened or darkened by up to this share. */
    variation: 0.16,
    /** A trunk's radius at its foot, per metre of the tree's height: as drawn, and as a car meets it. */
    trunkRadius: 0.016,
};
