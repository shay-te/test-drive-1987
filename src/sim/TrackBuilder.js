import { ROAD, PHYS } from '../config.js';
import { DEG, clamp, createRng, Noise, smoothstep } from '../util/math.js';
import { Track } from './Track.js';
import { roadsideAt } from './routeTerrain.js';

const MILE = 1609.34;
/** Segments of road kept behind the start line so the mirror has something to show. */
const START_PAD = 50;
/** Segments of scenery after the finish. */
const TAIL = 260;
/** Bends gentler than this radius (m) count as straight; tighter than SHARP or MEDIUM, as signed. */
const STRAIGHT_RADIUS = 1100;
const SHARP_RADIUS = 260;
const MEDIUM_RADIUS = 450;
/** The real cut beside the road: its foot up to `setback` m back from the road, its face climbing at
 *  least `steep` m per m for at most `reach` m; where there is none the wall is a `lowest` m bank. */
const CUT = { setback: 9, steep: 0.8, reach: 40, lowest: 1.2 };
/** The cut's foot is eased along the road over this many nodes either side, so it never jumps. */
const FOOT_EASE = 5;

/** Lays out a stage on its leg of the route: rock face, pull-outs, rails, signs, traps and gas
 *  station. Deterministic for a given stage seed. */
export function buildTrack(stage) {
    const builder = new TrackBuilder(stage);
    return builder.build();
}

class TrackBuilder {
    constructor(stage) {
        this.stage = stage;
        this.rng = createRng(stage.seed);
        this.noise = new Noise(stage.seed * 7 + 3);
        this.seg = ROAD.segment;
        this.startIndex = START_PAD;
        this.finishIndex = START_PAD + stage.segments;
        this.count = this.finishIndex + TAIL;
        this.curvature = new Float32Array(this.count);
        this.elevation = new Float32Array(this.count);
        this.wallOffset = new Float32Array(this.count);
        this.wallHeight = new Float32Array(this.count);
        this.wallTop = new Float32Array(this.count);
        this.wallSetback = new Float32Array(this.count);
        this.rail = new Uint8Array(this.count);
        this.pieces = [];
        this.props = [];
        this.traps = [];
    }

    build() {
        this._layoutRoute();
        this._layoutRockFace();
        this._placeTraps();
        this._placeFinish();
        this._layoutRails();
        this._placeSigns();
        return new Track({
            stage: this.stage,
            curvature: this.curvature,
            elevation: this.elevation,
            wallOffset: this.wallOffset,
            wallHeight: this.wallHeight,
            wallTop: this.wallTop,
            wallSetback: this.wallSetback,
            rail: this.rail,
            props: this.props,
            traps: this.traps,
            startS: this.startIndex * this.seg,
            finishS: this.finishIndex * this.seg,
            routeStart: this.routeStart,
            bearing: this.bearing,
        });
    }

    // ------------------------------------------------------------------ route

    /** The stage's leg of the real road: its bends and gradients, and the compass heading it starts on. */
    _layoutRoute() {
        const { route, startNode } = this.stage;
        this.routeStart = startNode - START_PAD;
        if (this.routeStart < 0 || this.routeStart + this.count > route.curvature.length)
            throw new Error(`Stage ${this.stage.name} runs off its route`);
        this.curvature.set(route.curvature.slice(this.routeStart, this.routeStart + this.count));
        this.elevation.set(route.elevation.slice(this.routeStart, this.routeStart + this.count));
        const turned = route.curvature.slice(0, this.routeStart).reduce((sum, k) => { return sum + k * this.seg; }, 0);
        this.bearing = route.bearingDeg + turned / DEG;
        this._findPieces();
    }

    /** Splits the road into straights and bends (typed by their tightest radius) for signs and traps. */
    _findPieces() {
        const turn = (i) => {
            const k = this.curvature[i];
            return Math.abs(k) * STRAIGHT_RADIUS < 1 ? 0 : Math.sign(k);
        };
        let start = 0;
        for (let i = 1; i <= this.count; i++) {
            if (i < this.count && turn(i) === turn(start)) continue;
            if (turn(start) === 0) this.pieces.push({ type: 'straight', start, end: i, k: 0 });
            else {
                let k = 0;
                for (let j = start; j < i; j++) if (Math.abs(this.curvature[j]) > Math.abs(k)) k = this.curvature[j];
                const radius = 1 / Math.abs(k);
                const type = radius < SHARP_RADIUS ? 'sharp' : radius < MEDIUM_RADIUS ? 'medium' : 'sweeper';
                this.pieces.push({ type, start, end: i, k, radius });
            }
            start = i;
        }
    }

    // ------------------------------------------------------------------ rock face

    /** The rock face on the right: the real cut, its foot where the ground starts to climb steeply (a
     *  verge in front where it stands back), its height and top where the climb ends. */
    _layoutRockFace() {
        const { noise } = this;
        const step = this.stage.route.nearSpacing;
        const steepAt = (i, out) => { return roadsideAt(this, i, 1, out + step) - roadsideAt(this, i, 1, out) >= CUT.steep * step; };
        const feet = Array.from({ length: this.count }, (_, i) => {
            let foot = 0;
            while (foot + step <= CUT.setback && !steepAt(i, foot)) foot += step;
            return steepAt(i, foot) ? foot : 0;
        });
        for (let i = 0; i < this.count; i++) {
            const s = i * this.seg;
            const rise = (out) => { return roadsideAt(this, i, 1, out); };
            const steep = (out) => { return steepAt(i, out); };
            const near = feet.slice(Math.max(0, i - FOOT_EASE), i + FOOT_EASE + 1);
            const foot = near.reduce((sum, f) => { return sum + f; }, 0) / near.length;
            let top = foot;
            while (top + step <= foot + CUT.reach && steep(top)) top += step;
            this.wallOffset[i] = ROAD.wallOffset + 0.45 * (noise.noise2(s / 70, 4.1) + 0.6) + foot;
            this.wallSetback[i] = foot;
            this.wallHeight[i] = Math.max(CUT.lowest, rise(top));
            this.wallTop[i] = top - foot;
        }
    }

    /** Widens the ledge on the rock side (a lay-by cut into the mountain). */
    _addPullout(center, halfLength, depth, ramp = 14) {
        for (let i = center - halfLength - ramp; i <= center + halfLength + ramp; i++) {
            if (i < 0 || i >= this.count) continue;
            const d = Math.abs(i - center);
            const f = d <= halfLength ? 1 : smoothstep(halfLength + ramp, halfLength, d);
            this.wallOffset[i] = Math.max(this.wallOffset[i], ROAD.wallOffset + depth * f);
        }
    }

    // ------------------------------------------------------------------ police

    _placeTraps() {
        const { stage, rng } = this;
        const lo = this.startIndex + stage.segments * 0.14;
        const hi = this.finishIndex - stage.segments * 0.12;
        const candidates = this.pieces.filter((p) => {
            return (p.type === 'straight' || p.type === 'sweeper') && p.start > lo && p.start < hi;
        });
        const chosen = [];
        const spacing = stage.segments / (stage.traps + 1);
        for (let t = 0; t < stage.traps; t++) {
            const ideal = this.startIndex + spacing * (t + 1);
            let best = null;
            for (const p of candidates) {
                const d = Math.abs(p.start - ideal);
                if (
                    chosen.some((c) => {
                        return Math.abs(c - p.start) < 160;
                    })
                )
                    continue;
                if (!best || d < Math.abs(best.start - ideal)) best = p;
            }
            const index = best ? best.start + 18 : Math.round(ideal + rng.range(-40, 40));
            chosen.push(index);
        }
        for (const index of chosen.sort((a, b) => {
            return a - b;
        })) {
            this._addPullout(index, 9, 5.5);
            this.traps.push({ s: index * this.seg, u: ROAD.wallOffset + 3.2 });
        }
    }

    // ------------------------------------------------------------------ finish

    _placeFinish() {
        const s = this.finishIndex * this.seg;
        if (this.stage.summit) {
            this._addPullout(this.finishIndex + 4, 30, 34, 16);
            this.props.push({ type: 'dealership', s: s + 10, u: 24 });
            this.props.push({ type: 'sign', kind: 'summit', s: s - 70, u: 6.2 });
        } else {
            this._addPullout(this.finishIndex + 4, 26, 30, 16);
            this.props.push({ type: 'station', s: s + 8, u: 22 });
            this.props.push({ type: 'sign', kind: 'gasPole', s: s - 60, u: 7.8 });
        }
    }

    // ------------------------------------------------------------------ guard rails

    _layoutRails() {
        const sharp = 1 / 380;
        const marks = new Uint8Array(this.count);
        for (let i = 0; i < this.count; i++) {
            if (Math.abs(this.curvature[i]) > sharp) {
                for (let j = Math.max(0, i - 14); j < Math.min(this.count, i + 14); j++) marks[j] = 1;
            }
        }
        // Some extra stretches of rail on straights.
        for (let b = this.startIndex; b < this.count; b += 60) {
            if (this.rng() < 0.18) for (let j = b; j < Math.min(this.count, b + 45); j++) marks[j] = 1;
        }
        this.rail.set(marks);
    }

    // ------------------------------------------------------------------ signs

    _placeSigns() {
        const { props, seg } = this;
        const finishS = this.finishIndex * seg;
        const startS = this.startIndex * seg;
        const rightSide = (s) => {
            return this.wallOffsetAtIndex(Math.round(s / seg)) - 0.9;
        };

        props.push({ type: 'sign', kind: 'speed55', s: startS + 90, u: rightSide(startS + 90) });
        for (const trap of this.traps) {
            const s = trap.s + 120;
            props.push({ type: 'sign', kind: 'speed55', s, u: rightSide(s) });
        }

        for (const p of this.pieces) {
            if (p.type !== 'sharp' && p.type !== 'medium') continue;
            const s = (p.start - 32) * seg;
            if (s < startS + 60 || s > finishS - 60) continue;
            if (
                props.some((q) => {
                    return q.type === 'sign' && Math.abs(q.s - s) < 30;
                })
            )
                continue;
            const advisory = Math.max(25, Math.floor(Math.sqrt(p.radius * PHYS.g * 0.32) / PHYS.mph / 5) * 5);
            props.push({ type: 'sign', kind: p.k > 0 ? 'curveR' : 'curveL', advisory, s, u: rightSide(s) });
        }

        if (!this.stage.summit) {
            for (const [dist, kind] of [
                [MILE, 'gas1mi'],
                [MILE / 2, 'gasHalf'],
            ]) {
                const s = finishS - dist;
                if (s > startS + 50) props.push({ type: 'sign', kind, s, u: rightSide(s) });
            }
        }

        for (let m = 1; m * MILE < finishS - startS - 100; m++) {
            props.push({
                type: 'sign',
                kind: 'mile',
                label: m,
                s: startS + m * MILE,
                u: ROAD.postOffset + 0.25,
            });
        }
    }

    wallOffsetAtIndex(i) {
        return this.wallOffset[clamp(i, 0, this.count - 1)];
    }
}
