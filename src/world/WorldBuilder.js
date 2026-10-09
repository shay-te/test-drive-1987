import * as THREE from 'three';
import { ROAD } from '../config.js';
import { SEA_LEVEL, SHOULDER_DROP } from '../sim/Landscape.js';
import { roadsideAt } from '../sim/routeTerrain.js';
import { Noise, clamp, createRng, lerp, smoothstep } from '../util/math.js';
import { mixRgb } from '../util/color.js';
import { buildRibbon } from './Ribbon.js';
import { ROAD_TEXTURE_LENGTH, ROCK_TEXTURE_SIZE, shadeVertex } from './Materials.js';
import { buildProps } from './Props.js';
import { TREE_LINE_LOW } from './Terrain.js';

const FACE_ROWS = 12;
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
        return buildRibbon(
            track,
            this.materials.rock,
            (i) => {
                return this._faceSection(track, i);
            },
            {
                alongTile: ROCK_TEXTURE_SIZE,
                acrossTile: ROCK_TEXTURE_SIZE,
                displace: (world, _p, c, i) => {
                    if (c === 0) return;
                    // Relief only recedes into the mountain so the rock never pokes past the collision line.
                    const depth =
                        (0.5 + 0.5 * this.noise.fbm3(world.x * 0.09, world.y * 0.07, world.z * 0.09, 4)) *
                        2.6;
                    world.x += Math.cos(track.heading[i]) * depth;
                    world.z += Math.sin(track.heading[i]) * depth;
                },
                color: (p) => {
                    return shadeVertex('#ffffff', clamp(0.55 + p.h / 18, 0.55, 1));
                },
            },
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

    /** Scrubby mountainside climbing away above the rock face. */
    _upperSlope(track) {
        const vegetation = this.stage.vegetation;
        return buildRibbon(
            track,
            this.materials.terrain,
            (i) => {
                return this._slopeSection(track, i);
            },
            {
                alongTile: 14,
                acrossTile: 14,
                displace: (world) => {
                    world.y += this.noise.fbm3(world.x * 0.02, 3.3, world.z * 0.02, 3) * SLOPE_ROUGHNESS;
                },
                color: (p, c) => {
                    const rockiness = clamp(1 - c / SLOPE_ROWS, 0, 1) * 0.6;
                    return mixRgb(shadeVertex(this.stage.rock, 1), shadeVertex(vegetation, 1), 1 - rockiness);
                },
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

    /** The sheer drop into the valley on the left. */
    _drop(track) {
        return buildRibbon(
            track,
            this.materials.cliff,
            (i) => {
                return this.landscape.dropSections[i];
            },
            {
                alongTile: ROCK_TEXTURE_SIZE,
                acrossTile: ROCK_TEXTURE_SIZE,
                displace: (world, p) => {
                    world.y += this.landscape.relief(world.x, world.z, -p.h);
                },
                color: (p) => {
                    return shadeVertex('#ffffff', clamp(1 + p.h / 160, 0.35, 1));
                },
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
