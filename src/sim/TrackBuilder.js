import { ROAD, PHYS } from '../config.js';
import { clamp, createRng, Noise, smoothstep } from '../util/math.js';
import { Track } from './Track.js';

const MILE = 1609.34;
/** Segments of road kept behind the start line so the mirror has something to show. */
const START_PAD = 50;
/** Segments of scenery after the finish. */
const TAIL = 260;
/** Heading is kept within this many radians of the stage direction so the road never folds back. */
const MAX_HEADING = 0.95;

/** Lays out a stage: bends, gradients, rock face, pull-outs, rails, signs, traps and gas station.
 *  Deterministic for a given stage seed. */
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
        this.rail = new Uint8Array(this.count);
        this.pieces = [];
        this.props = [];
        this.traps = [];
    }

    build() {
        this._layoutBends();
        this._layoutElevation();
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
            rail: this.rail,
            props: this.props,
            traps: this.traps,
            startS: this.startIndex * this.seg,
            finishS: this.finishIndex * this.seg,
        });
    }

    // ------------------------------------------------------------------ bends

    _layoutBends() {
        const { rng, stage } = this;
        let i = this.startIndex + 70;
        let psi = 0;
        const end = this.finishIndex - 110;

        while (i < end) {
            const roll = rng();
            const straightChance = 0.32 - stage.curviness * 0.18;
            if (roll < straightChance) {
                const len = rng.int(25, 90);
                this.pieces.push({ type: 'straight', start: i, end: i + len, k: 0 });
                i += len;
                continue;
            }
            if (roll < straightChance + 0.12 * (0.5 + stage.curviness)) {
                // Esses: two linked bends in opposite directions.
                const radius = rng.range(170, 360) * (1.25 - stage.sharpness * 0.45);
                const dir = this._chooseDirection(psi);
                i = this._addBend(i, dir, radius, rng.int(22, 40), psi, end);
                psi = this._headingAt(i);
                i = this._addBend(i, -dir, radius * rng.range(0.85, 1.2), rng.int(22, 40), psi, end);
                psi = this._headingAt(i);
                continue;
            }
            const severity = rng();
            let radius;
            if (severity < 0.18 + stage.sharpness * 0.22) radius = rng.range(95, 175);
            else if (severity < 0.55) radius = rng.range(190, 420);
            else radius = rng.range(450, 1100);
            const hold = rng.int(15, 70);
            i = this._addBend(i, this._chooseDirection(psi), radius, hold, psi, end);
            psi = this._headingAt(i);
        }
    }

    _chooseDirection(psi) {
        const pRight = clamp(0.5 - psi / 1.6, 0.08, 0.92);
        return this.rng() < pRight ? 1 : -1;
    }

    /** Writes a bend with eased entry/exit; returns the index after it. */
    _addBend(start, dir, radius, hold, psi, end) {
        const k = dir / radius;
        const ease = Math.round(clamp(radius / 14, 10, 34));
        // Limit the total heading change so the road stays within +-MAX_HEADING.
        const room = dir > 0 ? MAX_HEADING - psi : MAX_HEADING + psi;
        const maxLen = Math.max(0, (room * radius) / this.seg - ease);
        hold = Math.min(hold, Math.floor(maxLen));
        if (hold < 4) {
            const len = 30;
            this.pieces.push({ type: 'straight', start, end: start + len, k: 0 });
            return start + len;
        }
        const total = Math.min(ease * 2 + hold, end - start);
        for (let n = 0; n < total; n++) {
            let f;
            if (n < ease) f = smoothstep(0, 1, n / ease);
            else if (n < ease + hold) f = 1;
            else f = smoothstep(0, 1, (total - n) / ease);
            this.curvature[start + n] = k * f;
        }
        this.pieces.push({
            type: radius < 260 ? 'sharp' : radius < 450 ? 'medium' : 'sweeper',
            start,
            end: start + total,
            k,
            radius,
        });
        return start + total;
    }

    _headingAt(index) {
        let psi = 0;
        for (let i = 0; i < index; i++) psi += this.curvature[i] * this.seg;
        return psi;
    }

    // ------------------------------------------------------------------ elevation

    _layoutElevation() {
        const { stage, noise } = this;
        const baseGrade = stage.climb / (stage.segments * this.seg);
        let y = stage.startElevation;
        for (let i = 0; i < this.count; i++) {
            this.elevation[i] = y;
            const s = i * this.seg;
            let grade = baseGrade + 0.05 * noise.fbm2(s / 420, 0.3, 3);
            // Level ground around the start, the gas station and the summit.
            const nearStart = smoothstep(this.startIndex + 30, this.startIndex + 90, i);
            const nearFinish =
                1 -
                smoothstep(this.finishIndex - 70, this.finishIndex - 25, i) *
                    (1 - smoothstep(this.finishIndex + 40, this.finishIndex + 90, i));
            grade *= nearStart * nearFinish;
            y += clamp(grade, -0.05, 0.1) * this.seg;
        }
    }

    // ------------------------------------------------------------------ rock face

    _layoutRockFace() {
        const { noise, stage } = this;
        for (let i = 0; i < this.count; i++) {
            const s = i * this.seg;
            this.wallOffset[i] = ROAD.wallOffset + 0.45 * (noise.noise2(s / 70, 4.1) + 0.6);
            let h = 17 + 28 * (0.5 + 0.5 * noise.fbm2(s / 260, 9.7, 3));
            if (stage.summit) h *= 1 - 0.93 * smoothstep(this.finishIndex - 380, this.finishIndex - 60, i);
            this.wallHeight[i] = h;
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
