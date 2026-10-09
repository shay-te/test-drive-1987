import * as THREE from 'three';
import { ROAD } from '../config.js';
import { SEA_LEVEL, SHOULDER_DROP } from '../sim/Landscape.js';
import { roadsideAt } from '../sim/routeTerrain.js';
import { landUv } from './routeFrame.js';
import { Noise, clamp, createRng, lerp, smoothstep } from '../util/math.js';
import { buildRibbon } from './Ribbon.js';
import { ROAD_TEXTURE_LENGTH, shadeVertex } from './Materials.js';
import { buildProps } from './Props.js';
import { TREE_LINE_LOW } from './Terrain.js';

/** The cut's mesh: rows up its height, and rows along the road for each track node. */
const FACE_ROWS = 32;
const ROWS_PER_NODE = 3;
/** Blasted granite: blocks `block` m across and up, each set back by up to `step` m; joints between them
 *  `crack` m deep, `width` of a block wide; broad bulges and fine grain ([depth m, frequency per m]); and
 *  how much darker the cracks and the deepest blocks are. */
const GRANITE = {
    block: [2.6, 1.8], step: 1.4, crack: 0.5, width: 0.12,
    bulge: [1.8, 0.035], grain: [0.25, 0.6], shade: { crack: 0.45, recess: 0.2 },
};
/** The mountainside above the face, in rows reaching SLOPE_REACH m out from its top. */
const SLOPE_ROWS = 12;
const SLOPE_REACH = 48;
/** Rounding over from the face into the slope (m out), and the scrub's roughness on it (m). */
const FACE_ROUNDING = 5;
const SLOPE_ROUGHNESS = 1.5;
/** Builds the static scenery of a stage: road, shoulders, the rock face, the drop, rails and props. */
export class WorldBuilder {
    constructor(materials, stage, landscape, authored) {
        this.materials = materials;
        this.stage = stage;
        this.landscape = landscape;
        this.authored = authored;
        this.noise = new Noise(stage.seed + 99);
    }

    build(track) {
        const group = new THREE.Group();
        const m = this.materials;
        const road = buildRibbon(
            track,
            m.road,
            () => {
                return [
                    { u: -ROAD.halfWidth, h: 0 },
                    { u: ROAD.halfWidth, h: 0 },
                ];
            },
            { alongTile: ROAD_TEXTURE_LENGTH, acrossTile: ROAD.halfWidth * 2 },
        );
        const leftShoulder = buildRibbon(
            track,
            m.gravel,
            () => {
                return [
                    { u: ROAD.edgeOffset, h: -SHOULDER_DROP },
                    { u: -ROAD.halfWidth, h: -0.01 },
                ];
            },
            { alongTile: 2, acrossTile: 2 },
        );
        const rightShoulder = buildRibbon(
            track,
            m.gravel,
            (i) => {
                return [
                    { u: ROAD.halfWidth, h: -0.01 },
                    { u: track.wallOffset[i] + 0.4, h: -SHOULDER_DROP },
                ];
            },
            { alongTile: 2, acrossTile: 2 },
        );
        for (const mesh of [road, leftShoulder, rightShoulder]) setShadows(mesh, false, true);
        group.add(road, leftShoulder, rightShoulder);
        group.add(setShadows(this._rockFace(track), true, true));
        group.add(setShadows(this._upperSlope(track), true, true));
        group.add(setShadows(this._drop(track), false, true));
        group.add(this._rails(track));
        group.add(buildProps(track, m, this.stage, this.authored));
        return group;
    }

    /** The vertical cut through the mountain on the right, with relief carved in by noise. */
    _rockFace(track) {
        let blocks = null;
        return buildRibbon(
            track,
            this.materials.rock,
            (i) => {
                return this._faceSection(track, i);
            },
            {
                steps: ROWS_PER_NODE,
                // The blocks under each vertex, worked out once for its relief and its shade.
                displace: (world, _p, c, i) => {
                    blocks = this._blocks(world);
                    if (c === 0) return;
                    // Relief only recedes into the mountain so the rock never pokes past the collision line.
                    const depth = this._granite(world, blocks);
                    world.x += Math.cos(track.heading[i]) * depth;
                    world.z += Math.sin(track.heading[i]) * depth;
                },
                color: (p) => {
                    const { joint, recess } = blocks;
                    const shade = GRANITE.shade;
                    return shadeVertex('#ffffff', clamp(0.55 + p.h / 18, 0.55, 1) * (1 - shade.crack * joint) * (1 - shade.recess * recess));
                },
            },
        );
    }

    /** The blocks of granite at world point `p`: how deep in a joint it lies (0..1) and how far its
     *  block is set back (0..1). */
    _blocks({ x, y, z }) {
        const [across, up] = GRANITE.block;
        const cell = this.noise.cells3(x / across, y / up, z / across);
        return { joint: 1 - smoothstep(0, GRANITE.width, cell.next - cell.near), recess: cell.id };
    }

    /** How far blasted granite recedes from a flat face at world point `p` (m, never negative): its
     *  `blocks` (from _blocks) stepped back, the joints between them, broad bulges and fine grain. */
    _granite(p, { joint, recess }) {
        const n = this.noise;
        const [bulge, broad] = GRANITE.bulge;
        const [grain, fine] = GRANITE.grain;
        return (
            GRANITE.step * recess + GRANITE.crack * joint +
            bulge * (0.5 + 0.5 * n.fbm3(p.x * broad, p.y * broad * 1.2, p.z * broad, 3)) +
            grain * (0.5 + 0.5 * n.fbm3(p.x * fine, p.y * fine, p.z * fine, 2))
        );
    }

    /** The cut: from its foot up to the real cut's height, leaning back a little. */
    _faceSection(track, i) {
        const height = track.wallHeight[i];
        const foot = track.wallOffset[i];
        const points = [];
        for (let k = 0; k <= FACE_ROWS; k++) {
            const f = k / FACE_ROWS;
            const h = -0.4 + f * (height + 0.4);
            // Cut faces lean back slightly and round over into the slope at the top.
            points.push({ u: foot + h * 0.1 + smoothstep(0.82, 1, f) * FACE_ROUNDING, h });
        }
        return points;
    }

    /** The mountainside climbing away above the rock face, in the land's colours. */
    _upperSlope(track) {
        return buildRibbon(
            track,
            this.materials.land,
            (i) => {
                return this._slopeSection(track, i);
            },
            {
                steps: ROWS_PER_NODE,
                displace: (world) => {
                    world.y += this.noise.fbm3(world.x * 0.02, 3.3, world.z * 0.02, 3) * SLOPE_ROUGHNESS;
                },
                uvAt: this._landUv(track),
            },
        );
    }

    /** The real mountainside from the top of the cut outwards. */
    _slopeSection(track, i) {
        const top = this._faceSection(track, i).at(-1);
        const roadside = track.wallOffset[i] - track.wallSetback[i];
        const points = [top];
        for (let k = 1; k <= SLOPE_ROWS; k++) {
            const u = top.u + (k / SLOPE_ROWS) * SLOPE_REACH;
            points.push({ u, h: roadsideAt(track, i, 1, u - roadside) });
        }
        return points;
    }

    /** Pines dotted over the mountainside above the face and clinging to the drop below the road. */
    treePlacements(track) {
        const rng = createRng(this.stage.seed + 3);
        const placements = [];
        const drops = this.landscape.dropSections;
        const place = (i, section, from, to) => {
            const k = rng.int(from, to - 1);
            const f = rng();
            const u = lerp(section[k].u, section[k + 1].u, f);
            const h = lerp(section[k].h, section[k + 1].h, f);
            const p = track.nodeWorld(i, u, h - 0.5, {});
            if (p.y > SEA_LEVEL + TREE_LINE_LOW) placements.push({ x: p.x, y: p.y, z: p.z, height: rng.range(6, 15) });
        };
        for (let i = 0; i < track.count; i += 2) {
            if (rng() < 0.35) place(i, this._slopeSection(track, i), 1, SLOPE_ROWS);
            if (rng() < 0.18) place(i, drops[i], 0, drops[i].length - 5);
        }
        return placements;
    }

    /** Lays the picture of the route's surroundings on a ribbon by its world position. */
    _landUv(track) {
        return (world) => {
            return landUv(track, world.x, world.z);
        };
    }

    /** The ground falling away below the road on the left, in the land's colours. */
    _drop(track) {
        return buildRibbon(
            track,
            this.materials.land,
            (i) => {
                return this.landscape.dropSections[i];
            },
            {
                displace: (world, p) => {
                    world.y += this.landscape.relief(world.x, world.z, -p.h);
                },
                uvAt: this._landUv(track),
            },
        );
    }

    /** Steel guard rail along the valley side where the track says so. */
    _rails(track) {
        const group = new THREE.Group();
        let start = -1;
        for (let i = 0; i <= track.count; i++) {
            const on = i < track.count && track.rail[i] === 1;
            if (on && start < 0) start = i;
            if (!on && start >= 0) {
                const rail = buildRibbon(
                    track,
                    this.materials.steel,
                    () => {
                        return [
                            { u: ROAD.postOffset - 0.05, h: 0.82 },
                            { u: ROAD.postOffset, h: 0.78 },
                            { u: ROAD.postOffset, h: 0.46 },
                        ];
                    },
                    { from: start, to: Math.min(i, track.count - 1) },
                );
                group.add(setShadows(rail, true, false));
                start = -1;
            }
        }
        return group;
    }
}

function setShadows(object, cast, receive) {
    object.traverse((child) => {
        child.castShadow = cast;
        child.receiveShadow = receive;
    });
    return object;
}
