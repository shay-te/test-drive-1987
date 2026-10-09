import * as THREE from 'three';
import { RAIL, ROAD } from '../config.js';
import { SHOULDER_DROP } from '../sim/Landscape.js';
import { instanced, transform } from './Props.js';
import { buildRibbon } from './Ribbon.js';

/** A 1980s W-beam: the steel rail's top above the road, its height and the depth of its two
 *  corrugations (m), sampled in `points` across; posts every `spacing` m with a blockout `standoff` m
 *  deep between post and rail; timber posts `post` m square across the road and along it, sunk `sunk`
 *  m; the ends bent down into the ground over `RAIL.flare` m and splayed `splay` m away from the road. */
const W_BEAM = { top: 0.69, height: 0.31, depth: 0.083, points: 13, spacing: 1.905, standoff: 0.2, post: [0.2, 0.15], sunk: 0.4, splay: 0.6 };
/** The blockout's height, centred on the rail. */
const BLOCKOUT_HEIGHT = 0.36;

/** The guard rails of a stage where the track has them: the corrugated steel beam, its timber posts
 *  and blockouts every W_BEAM.spacing m, and its turned-down ends. */
export function buildGuardRails(track, materials) {
    const group = new THREE.Group();
    const posts = [];
    const blockouts = [];
    for (const [from, to] of railRuns(track)) {
        const ends = Math.round(RAIL.flare / track.segment);
        // 0 at either end of the run, 1 once the beam is at its full height.
        const rise = (i) => { return Math.min(1, (i - from) / ends, (to - i) / ends); };
        const beam = buildRibbon(track, materials.galvanised, (i) => { return beamSection(rise(i)); }, {
            from,
            to,
            steps: 4,
            alongTile: W_BEAM.spacing * 2,
            acrossTile: W_BEAM.height,
        });
        beam.traverse((mesh) => {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        });
        group.add(beam);
        for (let s = from * track.segment; s <= to * track.segment; s += W_BEAM.spacing) {
            const up = Math.min(1, rise(s / track.segment));
            if (up <= 0) continue;
            posts.push(postMatrix(track, s, up));
            blockouts.push(blockoutMatrix(track, s, up));
        }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    group.add(instanced(box, materials.timber, posts, true), instanced(box, materials.timber, blockouts, true));
    return group;
}

/** [first, last] node of each stretch of rail. */
function railRuns(track) {
    const runs = [];
    for (let i = 0; i < track.count; i++) {
        if (!track.rail[i]) continue;
        if (track.rail[i - 1]) runs.at(-1)[1] = i;
        else runs.push([i, i]);
    }
    return runs.filter(([from, to]) => { return to > from; });
}

/** The W-beam's cross-section, its crowns facing the road at the rail's line (ROAD.postOffset):
 *  `up` is how far the end bend has lifted it (1 standing, 0 in the ground and splayed away). */
function beamSection(up) {
    const w = W_BEAM;
    const lift = up * up * (3 - 2 * up);
    return Array.from({ length: w.points }, (_, k) => {
        const f = k / (w.points - 1);
        // Two crowns, a quarter and three quarters of the way down.
        const crown = 0.5 - 0.5 * Math.cos(4 * Math.PI * f);
        return {
            u: ROAD.postOffset - w.depth * (1 - crown) - (1 - lift) * w.splay,
            h: (w.top - f * w.height) * lift - (1 - lift) * w.sunk,
        };
    });
}

/** The rail's back, where the blockouts meet it. */
const BACK = ROAD.postOffset - W_BEAM.depth;

function postMatrix(track, s, up) {
    const w = W_BEAM;
    const [across, along] = w.post;
    const height = (w.top - 0.02) * up + w.sunk;
    const u = BACK - w.standoff - across / 2 - (1 - up) * w.splay;
    return transform(track, s, u, height / 2 - w.sunk - SHOULDER_DROP, [across, height, along]);
}

function blockoutMatrix(track, s, up) {
    const w = W_BEAM;
    const u = BACK - w.standoff / 2 - (1 - up) * w.splay;
    return transform(track, s, u, (w.top - w.height / 2) * up, [w.standoff, BLOCKOUT_HEIGHT * up, w.post[1]]);
}

