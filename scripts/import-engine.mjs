/** Builds the seamless rpm loops in assets/audio/engines/ (WAVs + manifest.json) from CC-licensed
 *  recordings of the cars; the method and the download commands are in that folder's README.md.
 *  Usage: node scripts/import-engine.mjs [car ...] [--track]   (--track dumps tracks to tmp/engine-work/) */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { CARS } from '../src/data/cars.js';

const CACHE = 'tmp/engine-cache';
const WORK = 'tmp/engine-work';
const OUTPUT = 'assets/audio/engines';
const MANIFEST = `${OUTPUT}/manifest.json`;
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const SAMPLE_RATE = 22050;
const SECONDS_PER_MINUTE = 60;
const CENTS_PER_OCTAVE = 1200;
/** A four-stroke fires every cylinder once per two revolutions. */
const REVS_PER_CYCLE = 2;
const HIGH_PASS_HZ = 25;
const LOW_PASS_HZ = 5000;

/** Tracking frames: 186 ms Hann windows every 46 ms, zero-padded to double the resolution. */
const FRAME = 4096;
const FFT_SIZE = 8192;
const HOP = 1024;
const STEPS_PER_OCTAVE = 96;
const TOP_HZ = 2400;
const COMB_HARMONICS = [1, 2, 3, 5, 7, 11, 13];
/** Viterbi: cost of a move between frames (times the move in octaves, squared), and the largest move. */
const JUMP_COST = 200;
const MAX_JUMP_OCTAVES = 0.15;
const SMOOTH_FRAMES = 5;
/** Search range around the car's own engine: a little under idle to a little over redline. */
const RPM_MARGIN = { low: 0.75, high: 1.05 };

/** Stretch shapes: a steady 1 s loop, or a 0.6 s one that may sweep further; each window adds room for
 *  the crossfade and the loop-point search. */
const SHAPES = [
    { loop: 1, window: 1.3, sweep: 0.25, step: 0.03, bonus: 2 },
    { loop: 0.6, window: 0.8, sweep: 0.4, step: 0.05, bonus: 0 },
];
const CROSSFADE_SECONDS = 0.08;
const LOOP_SEARCH_SECONDS = 0.05;
const WINDOW_STEP_FRAMES = 4;
/** A stretch may not wobble around its straight sweep, dip (gaps, edits), fade (head to tail thirds)
 *  or sit far below the recording's median level. */
const MAX_TRACK_WOBBLE_CENTS = 25;
const DROPOUT_DB = 8;
const QUIET_DB = 20;
const LEVEL_DRIFT_DB = 3;
/** Load: near idle, or falling faster than OFF_SLOPE (octaves/s), is off load; the rest is on load, a
 *  steady one (slope under ON_SLOPE) ranking behind a rising one. */
const ON_SLOPE = 0.1;
const OFF_SLOPE = -0.1;
const IDLE_BAND = 1.5;

/** Measuring a flattened stretch: long windows, fine bins, a running-median noise floor. */
const MEASURE_FRAME = 8192;
const MEASURE_FFT = 16384;
const BIN_HZ = SAMPLE_RATE / MEASURE_FFT;
const MEASURE_BAND = [40, 1500];
const FLATNESS_TOP_HZ = 4000;
const PEAK_BINS = 2;
const FLOOR_HZ = 30;
/** Drift: the comb pitch of the head and of the tail, searched on a fine grid. */
const DRIFT_SECONDS = 0.37;
const DRIFT_STEP_CENTS = 2;
const MAX_DRIFT_SEARCH_CENTS = 150;
/** Signature: line prominences at these multiples of the tracked comb, compared at these scales. */
const PROFILE_MULTIPLES = [0.5, 1, 1.5, 2, 3, 4, 6];
const SLIP_SCALES = [1 / 3, 1 / 2, 1, 2, 3];
const MIN_PROFILE_POINTS = 4;
/** Rejection thresholds: tonality, firing-line prominence, head-to-tail pitch drift, signature match. */
const MIN_TONAL_DB = 4;
const MIN_FIRING_DB = 6;
const MAX_DRIFT_CENTS = 20;
const MIN_SIGNATURE_MATCH = 0.7;

/** Selection per load: the best stretch in each rpm band, loops of a load at least the spacing apart. */
const BAND_OCTAVES = 0.6;
const MIN_LOOP_SPACING_OCTAVES = 0.35;
/** A steady part-throttle stretch stands in for an on-load loop, behind real accelerations. */
const STEADY_PENALTY_DB = 3;
/** Levels (dBFS RMS): on-load at redline, a gentle rise with rpm, off-load quieter; peak ceiling. */
const ON_LEVEL_DB = -16;
const LEVEL_DB_PER_OCTAVE = 3;
const OFF_LEVEL_DB = -6;
const PEAK_CEILING_DB = -1;
const PCM_MAX = 32767;
const WAV_HEADER_BYTES = 44;

/** CC BY YouTube (`yt-<id>`) and CC0 Freesound (`fs-<id>`) recordings: `order` = engine order of the
 *  tracked comb (README), `standIn` = a related engine, `exclude` = [from, to] s that are not the engine. */
const SOURCES = {
    porsche: [
        { id: 'yt-nFFq-kr-Ne8', order: 1.5 },
        { id: 'yt-7ex3IILPJxc', order: 1.5, standIn: true },
    ],
    ferrari: [
        { id: 'yt-y54WIBl-YkQ', order: 3 },
        { id: 'yt-SgcndXGRDJ8', order: 3 },
    ],
    lamborghini: [
        { id: 'yt-uYv1l31kgKc', order: 6 },
        // A steady ~320 Hz tone that does not follow the engine's idle lines.
        { id: 'fs-112075', order: 6, standIn: true, exclude: [[0, 3.7], [9.3, 12.8]] },
    ],
    lotus: [
        { id: 'yt-g3TB56F4sO8', order: 2, standIn: true },
        { id: 'yt-JOoPKIHNxN8', order: 2, standIn: true },
    ],
    corvette: [
        { id: 'yt-2m56Th1DQ1g', order: 4 },
        { id: 'yt-qcrtbrzZJRM', order: 4 },
        // The key-in-ignition chime before the start.
        { id: 'fs-637188', order: 4, standIn: true, exclude: [[0, 3.5]] },
        { id: 'fs-637183', order: 4, standIn: true },
    ],
};

const log2 = Math.log2;
const toDb = (power) => {
    return 10 * Math.log10(power + 1e-20);
};
const median = (values) => {
    const sorted = [...values].sort((a, b) => {
        return a - b;
    });
    return sorted[Math.floor(sorted.length / 2)];
};
const mean = (values) => {
    return values.reduce((sum, v) => {
        return sum + v;
    }, 0) / values.length;
};
const hann = (n) => {
    return Float64Array.from({ length: n }, (_, i) => {
        return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    });
};
const seconds = (s) => {
    return Math.round(s * SAMPLE_RATE);
};

/** Second-order Butterworth high- or low-pass (RBJ cookbook) over `pcm`. */
const biquad = (pcm, type, hz) => {
    const w = (2 * Math.PI * hz) / SAMPLE_RATE;
    const alpha = Math.sin(w) / Math.SQRT2;
    const a0 = 1 + alpha;
    const edge = type === 'highpass' ? 1 + Math.cos(w) : 1 - Math.cos(w);
    const b0 = edge / 2 / a0;
    const b1 = (type === 'highpass' ? -edge : edge) / a0;
    const a1 = (-2 * Math.cos(w)) / a0;
    const a2 = (1 - alpha) / a0;
    const out = new Float32Array(pcm.length);
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    for (let i = 0; i < pcm.length; i++) {
        const y = b0 * pcm[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
        [x2, x1, y2, y1] = [x1, pcm[i], y1, y];
        out[i] = y;
    }
    return out;
};

/** Decodes a downloaded source to mono float PCM at SAMPLE_RATE, without DC and handling rumble and
 *  without the hiss above the brightest cabin low-pass (never heard in the game). */
const decode = (source) => {
    const folder = `${CACHE}/${source}`;
    const file = readdirSync(folder).find((name) => {
        return name.startsWith('source.');
    });
    if (!file) throw new Error(`${folder} has no source file: download it first (assets/audio/engines/README.md)`);
    const args = ['-v', 'error', '-i', `${folder}/${file}`, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'];
    const result = spawnSync(FFMPEG, args, { maxBuffer: 1 << 30 });
    if (result.status !== 0) throw new Error(`ffmpeg failed on ${folder}/${file}: ${result.stderr}`);
    const bytes = result.stdout;
    const pcm = new Float32Array(bytes.length / Float32Array.BYTES_PER_ELEMENT);
    pcm.set(new Float32Array(bytes.buffer, bytes.byteOffset, pcm.length));
    const band = biquad(biquad(pcm, 'highpass', HIGH_PASS_HZ), 'lowpass', LOW_PASS_HZ);
    return biquad(band, 'lowpass', LOW_PASS_HZ);
};

/** In-place radix-2 complex FFT of size `n`. */
const makeFft = (n) => {
    const bits = log2(n);
    const reverse = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        let r = 0;
        for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
        reverse[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
        cos[i] = Math.cos((2 * Math.PI * i) / n);
        sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    return (re, im) => {
        for (let i = 0; i < n; i++) {
            const j = reverse[i];
            if (j > i) {
                [re[i], re[j]] = [re[j], re[i]];
                [im[i], im[j]] = [im[j], im[i]];
            }
        }
        for (let size = 2; size <= n; size *= 2) {
            const half = size / 2;
            const step = n / size;
            for (let start = 0; start < n; start += size) {
                for (let k = 0; k < half; k++) {
                    const a = start + k;
                    const b = a + half;
                    const tr = re[b] * cos[k * step] - im[b] * sin[k * step];
                    const ti = re[b] * sin[k * step] + im[b] * cos[k * step];
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
        }
    };
};

/** Short-time magnitude spectra (bins up to `topHz`) of `pcm`, one per `hop` samples. */
const spectra = (pcm, { frame, size, hop, topHz }) => {
    const fft = makeFft(size);
    const window = hann(frame);
    const bins = Math.min(size / 2, Math.ceil((topHz * size) / SAMPLE_RATE) + 2);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    const frames = [];
    for (let start = 0; start + frame <= pcm.length; start += hop) {
        re.fill(0);
        im.fill(0);
        let power = 0;
        for (let i = 0; i < frame; i++) {
            re[i] = pcm[start + i] * window[i];
            power += pcm[start + i] ** 2;
        }
        fft(re, im);
        const magnitude = new Float32Array(bins);
        for (let b = 0; b < bins; b++) magnitude[b] = Math.hypot(re[b], im[b]);
        frames.push({ time: (start + frame / 2) / SAMPLE_RATE, rms: Math.sqrt(power / frame), magnitude });
    }
    return frames;
};
const TRACKING = { frame: FRAME, size: FFT_SIZE, hop: HOP, topHz: TOP_HZ };
const MEASURING = { frame: MEASURE_FRAME, size: MEASURE_FFT, hop: MEASURE_FRAME / 4, topHz: FLATNESS_TOP_HZ };

/** Linear interpolation of a spectrum (FFT size `size`) at `hz`. */
const at = (spectrum, hz, size) => {
    const x = (hz * size) / SAMPLE_RATE;
    const i = Math.floor(x);
    if (i + 1 >= spectrum.length) return 0;
    return spectrum[i] + (spectrum[i + 1] - spectrum[i]) * (x - i);
};

/** Peak-minus-valley comb score of fundamental `hz` over the first and prime harmonics (SWIPE'-like). */
const combScore = (spectrum, hz, size = FFT_SIZE) => {
    let score = 0;
    let weights = 0;
    for (const k of COMB_HARMONICS) {
        if (k * hz > TOP_HZ) break;
        const weight = 1 / Math.sqrt(k);
        const valley = (at(spectrum, (k - 0.5) * hz, size) + at(spectrum, (k + 0.5) * hz, size)) / 2;
        score += weight * (at(spectrum, k * hz, size) - valley);
        weights += weight;
    }
    return score / weights;
};

/** Comb fundamentals (log-spaced) covering the car's rpm range, for a comb of engine order `order`. */
const grid = (car, order) => {
    const low = (car.engine.idleRpm * RPM_MARGIN.low * order) / SECONDS_PER_MINUTE;
    const high = (car.engine.redline * RPM_MARGIN.high * order) / SECONDS_PER_MINUTE;
    const count = Math.ceil(log2(high / low) * STEPS_PER_OCTAVE) + 1;
    return Float64Array.from({ length: count }, (_, i) => {
        return low * 2 ** (i / STEPS_PER_OCTAVE);
    });
};

/** Comb scores of every frame (root-compressed spectrum, normalised by its mean). */
const scoreFrames = (frames, hz) => {
    return frames.map((frame) => {
        const root = frame.magnitude.map(Math.sqrt);
        const level = mean(root) || 1;
        return hz.map((f) => {
            return combScore(root, f) / level;
        });
    });
};

/** Viterbi path through the comb scores (the steadiest strong comb per frame), median-smoothed. */
const track = (frames, hz) => {
    const n = hz.length;
    const maxJump = Math.round(MAX_JUMP_OCTAVES * STEPS_PER_OCTAVE);
    const scores = scoreFrames(frames, hz);
    const back = frames.map(() => {
        return new Int16Array(n);
    });
    let total = Float64Array.from(scores[0]);
    for (let t = 1; t < frames.length; t++) {
        const next = new Float64Array(n);
        for (let s = 0; s < n; s++) {
            let best = -Infinity;
            for (let p = Math.max(0, s - maxJump); p <= Math.min(n - 1, s + maxJump); p++) {
                const value = total[p] - JUMP_COST * ((s - p) / STEPS_PER_OCTAVE) ** 2;
                if (value > best) {
                    best = value;
                    back[t][s] = p;
                }
            }
            next[s] = best + scores[t][s];
        }
        total = next;
    }
    const path = new Int16Array(frames.length);
    path[frames.length - 1] = total.indexOf(Math.max(...total));
    for (let t = frames.length - 1; t > 0; t--) path[t - 1] = back[t][path[t]];
    const octaves = Array.from(path, (s) => {
        return log2(hz[s]);
    });
    return octaves.map((_, t) => {
        const near = octaves.slice(Math.max(0, t - (SMOOTH_FRAMES >> 1)), t + (SMOOTH_FRAMES >> 1) + 1);
        return { octave: median(near), score: scores[t][path[t]] };
    });
};

/** Least-squares line through `ys` (x = index): slope and the RMS residual. */
const fitLine = (ys) => {
    const mx = (ys.length - 1) / 2;
    const my = mean(ys);
    let sxy = 0;
    let sxx = 0;
    ys.forEach((y, x) => {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
    });
    const slope = sxy / sxx;
    const residual = Math.sqrt(
        mean(
            ys.map((y, x) => {
                return (y - (my + slope * (x - mx))) ** 2;
            }),
        ),
    );
    return { slope, residual };
};

/** Stretches of one shape where the track is continuous, smooth, loud enough and unbroken;
 *  `skipped` counts the stretches each rule turned down. */
const findWindows = (frames, path, source, car, shape, skipped) => {
    const length = Math.round(seconds(shape.window) / HOP);
    const levels = frames.map((f) => {
        return 20 * Math.log10(f.rms + 1e-9);
    });
    const floor = median(levels) - QUIET_DB;
    const windows = [];
    for (let start = 0; start + length <= frames.length; start += WINDOW_STEP_FRAMES) {
        const from = frames[start].time;
        const to = frames[start + length - 1].time;
        const octaves = path.slice(start, start + length).map((p) => {
            return p.octave;
        });
        const level = levels.slice(start, start + length);
        const { slope, residual } = fitLine(octaves);
        const rules = {
            excluded: (source.exclude ?? []).some(([a, b]) => {
                return from < b && to > a;
            }),
            quiet: median(level) < floor,
            dropout: Math.min(...level) < median(level) - DROPOUT_DB,
            fade: Math.abs(mean(level.slice(0, length / 3)) - mean(level.slice((2 * length) / 3))) > LEVEL_DRIFT_DB,
            jump: octaves.slice(1).some((o, i) => {
                return Math.abs(o - octaves[i]) > shape.step;
            }),
            sweep: Math.max(...octaves) - Math.min(...octaves) > shape.sweep,
            wobble: residual * CENTS_PER_OCTAVE > MAX_TRACK_WOBBLE_CENTS,
        };
        const broken = Object.keys(rules).find((rule) => {
            return rules[rule];
        });
        if (broken) {
            skipped[broken] = (skipped[broken] ?? 0) + 1;
            continue;
        }
        const hz = 2 ** mean(octaves);
        const rpm = (hz * SECONDS_PER_MINUTE) / source.order;
        const perSecond = (slope * SAMPLE_RATE) / HOP;
        const steady = perSecond < ON_SLOPE && perSecond > OFF_SLOPE;
        const idle = rpm <= car.engine.idleRpm * IDLE_BAND;
        const load = idle || perSecond <= OFF_SLOPE ? 'off' : 'on';
        windows.push({ source: source.id, shape, from, to, hz, rpm, load, steady, slope: perSecond });
    }
    return windows;
};

/** Four-point cubic (Catmull-Rom) read of `pcm` at fractional index `x`. */
const sample = (pcm, x) => {
    const i = Math.floor(x);
    const t = x - i;
    const p0 = pcm[i - 1] ?? pcm[i];
    const p1 = pcm[i];
    const p2 = pcm[i + 1] ?? p1;
    const p3 = pcm[i + 2] ?? p2;
    return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
};

/** Resamples a stretch so its pitch holds at the stretch's mean: a sweep becomes a steady note. */
const flatten = (pcm, path, window, samples) => {
    const pitchAt = (position) => {
        const x = (position - FRAME / 2) / HOP;
        const i = Math.max(0, Math.min(path.length - 2, Math.floor(x)));
        const t = Math.max(0, Math.min(1, x - i));
        return 2 ** (path[i].octave + (path[i + 1].octave - path[i].octave) * t);
    };
    const out = new Float32Array(samples);
    let position = window.from * SAMPLE_RATE;
    for (let n = 0; n < samples; n++) {
        out[n] = sample(pcm, position);
        position += window.hz / pitchAt(position);
    }
    return out;
};

/** Mean power spectrum of a stretch. */
const powerSpectrum = (audio, options = MEASURING) => {
    const frames = spectra(audio, options);
    const power = new Float64Array(frames[0].magnitude.length);
    for (const frame of frames) {
        frame.magnitude.forEach((m, b) => {
            power[b] += (m * m) / frames.length;
        });
    }
    return power;
};

/** Running-median noise floor of a power spectrum around bin `b`. */
const floorAt = (power, b) => {
    const reach = Math.round(FLOOR_HZ / BIN_HZ);
    return median(power.slice(Math.max(0, b - reach), b + reach + 1));
};

/** How far the strongest bin near `hz` stands above the local floor (dB). */
const prominence = (power, hz) => {
    const b = Math.round(hz / BIN_HZ);
    return toDb(Math.max(...power.slice(b - PEAK_BINS, b + PEAK_BINS + 1))) - toDb(floorAt(power, b));
};

/** Tonality (power over its running-median floor), firing-line prominence and spectral flatness. */
const measure = (audio, firing) => {
    const power = powerSpectrum(audio);
    const low = Math.round(MEASURE_BAND[0] / BIN_HZ);
    const high = Math.round(MEASURE_BAND[1] / BIN_HZ);
    let total = 0;
    let floor = 0;
    for (let b = low; b <= high; b++) {
        total += power[b];
        floor += floorAt(power, b);
    }
    const band = power.slice(low, Math.round(FLATNESS_TOP_HZ / BIN_HZ));
    const logMean = mean(
        Array.from(band, (p) => {
            return Math.log(p + 1e-20);
        }),
    );
    const flatness = Math.exp(logMean) / (mean(band) + 1e-20);
    return { tonal: toDb(total) - toDb(floor), firing: prominence(power, firing), flatness, power };
};

/** Pitch drift (cents) between the head and the tail of a flattened stretch: where the comb of each
 *  part peaks, on a fine grid around the reference pitch. */
const drift = (audio, hz) => {
    const part = seconds(DRIFT_SECONDS);
    const options = { frame: part, size: MEASURE_FFT, hop: part, topHz: TOP_HZ };
    const steps = Math.round(MAX_DRIFT_SEARCH_CENTS / DRIFT_STEP_CENTS);
    const pitch = (pcm) => {
        const root = spectra(pcm, options)[0].magnitude.map(Math.sqrt);
        let best = { cents: 0, score: -Infinity };
        for (let i = -steps; i <= steps; i++) {
            const cents = i * DRIFT_STEP_CENTS;
            const score = combScore(root, hz * 2 ** (cents / CENTS_PER_OCTAVE), MEASURE_FFT);
            if (score > best.score) best = { cents, score };
        }
        return best.cents;
    };
    return pitch(audio.subarray(audio.length - part)) - pitch(audio.subarray(0, part));
};

/** The engine's harmonic signature at comb `hz`: line prominences at a few multiples of it. */
const signature = (power, hz) => {
    return PROFILE_MULTIPLES.map((m) => {
        const f = m * hz;
        return f < MEASURE_BAND[0] || f > MEASURE_BAND[1] ? NaN : prominence(power, f);
    });
};

const correlation = (a, b) => {
    const pairs = a
        .map((v, i) => {
            return [v, b[i]];
        })
        .filter(([x, y]) => {
            return Number.isFinite(x) && Number.isFinite(y);
        });
    if (pairs.length < MIN_PROFILE_POINTS) return 0;
    const mx = mean(
        pairs.map(([x]) => {
            return x;
        }),
    );
    const my = mean(
        pairs.map(([, y]) => {
            return y;
        }),
    );
    let [sxy, sxx, syy] = [0, 0, 0];
    for (const [x, y] of pairs) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy + 1e-20);
};

/** Slip check: a stretch's signature must match the recording's usual one at the tracked comb better
 *  than at a third, half, double or triple of it, or the tracker has slipped onto another line. */
const slipOf = (stretch, usual) => {
    const matches = SLIP_SCALES.map((scale) => {
        return correlation(signature(stretch.power, stretch.hz * scale), usual);
    });
    return { slip: SLIP_SCALES[matches.indexOf(Math.max(...matches))], match: matches[SLIP_SCALES.indexOf(1)] };
};

/** The loop length (near the shape's loop) whose continuation best matches the head, and the loop:
 *  its first CROSSFADE_SECONDS fade in while the audio that follows its end fades out (equal power). */
const makeLoop = (audio, shape) => {
    const fade = seconds(CROSSFADE_SECONDS);
    const nominal = seconds(shape.loop);
    const search = seconds(LOOP_SEARCH_SECONDS);
    let best = { length: nominal, match: -Infinity };
    for (let length = nominal - search; length <= nominal + search; length++) {
        let dot = 0;
        let a2 = 0;
        let b2 = 0;
        for (let i = 0; i < fade; i++) {
            dot += audio[i] * audio[length + i];
            a2 += audio[i] ** 2;
            b2 += audio[length + i] ** 2;
        }
        const match = dot / Math.sqrt(a2 * b2 + 1e-20);
        if (match > best.match) best = { length, match };
    }
    const loop = audio.slice(0, best.length);
    for (let i = 0; i < fade; i++) {
        const t = (i / fade) * (Math.PI / 2);
        loop[i] = audio[i] * Math.sin(t) + audio[best.length + i] * Math.cos(t);
    }
    return { loop, match: best.match };
};

const rmsDb = (pcm) => {
    return toDb(
        mean(
            Array.from(pcm, (v) => {
                return v * v;
            }),
        ),
    );
};

/** Level of a loop: on-load rises gently with rpm up to ON_LEVEL_DB at redline, off-load sits lower. */
const targetLevel = (car, stretch) => {
    const rise = LEVEL_DB_PER_OCTAVE * log2(stretch.rpm / car.engine.redline);
    return ON_LEVEL_DB + rise + (stretch.load === 'off' ? OFF_LEVEL_DB : 0);
};

/** 16-bit PCM mono WAV bytes. */
const wav = (pcm) => {
    const bytes = Buffer.alloc(WAV_HEADER_BYTES + pcm.length * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(SAMPLE_RATE, 24);
    bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(pcm.length * 2, 40);
    pcm.forEach((v, i) => {
        bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * PCM_MAX), WAV_HEADER_BYTES + i * 2);
    });
    return bytes;
};

/** The rpm track of a source, written for inspection. */
const dumpTrack = (car, source, frames, path, pcm) => {
    const rows = frames.map((frame, t) => {
        return {
            time: +frame.time.toFixed(3),
            rpm: Math.round((2 ** path[t].octave * SECONDS_PER_MINUTE) / source.order),
            score: +path[t].score.toFixed(3),
            db: +(20 * Math.log10(frame.rms + 1e-9)).toFixed(1),
        };
    });
    const pulsesPerRev = car.sound.cylinders / REVS_PER_CYCLE;
    writeFileSync(`${WORK}/${source.id}.json`, JSON.stringify({ car: car.id, pulsesPerRev, order: source.order, rows }));
    writeFileSync(`${WORK}/${source.id}.f32`, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
};

/** Every stretch of one recording, flattened and measured; `failed` names the check it failed. */
const stretchesOf = (car, source, dumpTracks) => {
    const pulsesPerRev = car.sound.cylinders / REVS_PER_CYCLE;
    const pcm = decode(source.id);
    const frames = spectra(pcm, TRACKING);
    const path = track(frames, grid(car, source.order));
    if (dumpTracks) dumpTrack(car, source, frames, path, pcm);
    const skipped = {};
    const measured = SHAPES.flatMap((shape) => {
        const span = seconds(shape.loop + LOOP_SEARCH_SECONDS + 2 * CROSSFADE_SECONDS);
        return findWindows(frames, path, source, car, shape, skipped).map((window) => {
            const audio = flatten(pcm, path, window, span);
            const firing = (window.rpm * pulsesPerRev) / SECONDS_PER_MINUTE;
            return { ...window, ...measure(audio, firing), drift: drift(audio, window.hz), audio };
        });
    });
    const clear = measured.filter((s) => {
        return s.tonal >= MIN_TONAL_DB && s.firing >= MIN_FIRING_DB;
    });
    const usual = PROFILE_MULTIPLES.map((_, i) => {
        const values = clear
            .map((s) => {
                return signature(s.power, s.hz)[i];
            })
            .filter(Number.isFinite);
        return values.length ? median(values) : NaN;
    });
    console.info(
        `[engine] ${car.id} ${source.id}: ${(pcm.length / SAMPLE_RATE).toFixed(1)} s, ${measured.length} smooth ` +
            `stretches (turned down: ${JSON.stringify(skipped)})`,
    );
    return measured.map(({ power, ...stretch }) => {
        const { slip, match } = slipOf({ ...stretch, power }, usual);
        const checks = {
            tonal: stretch.tonal < MIN_TONAL_DB,
            firing: stretch.firing < MIN_FIRING_DB,
            drift: Math.abs(stretch.drift) > MAX_DRIFT_CENTS,
            signature: match < MIN_SIGNATURE_MATCH,
            slip: slip !== 1,
        };
        const failed = Object.keys(checks).find((check) => {
            return checks[check];
        });
        const penalty = stretch.steady && stretch.load === 'on' ? STEADY_PENALTY_DB : 0;
        const quality = stretch.tonal + stretch.firing / 2 + stretch.shape.bonus - penalty;
        return { ...stretch, signatureMatch: match, slip, quality, failed };
    });
};

/** Adds to `chosen` the best stretch of each load in each rpm band, skipping overlaps and near-duplicate rpms. */
const fillBands = (car, stretches, chosen) => {
    const bottom = car.engine.idleRpm * RPM_MARGIN.low;
    const ranked = [...stretches].sort((a, b) => {
        return b.quality - a.quality;
    });
    for (const s of ranked) {
        const band = Math.floor(log2(s.rpm / bottom) / BAND_OCTAVES);
        const clash = chosen.some((o) => {
            const overlaps = o.source === s.source && s.from < o.to && s.to > o.from;
            const near = o.load === s.load && (o.band === band || Math.abs(log2(o.rpm / s.rpm)) < MIN_LOOP_SPACING_OCTAVES);
            return overlaps || near;
        });
        if (!clash) chosen.push({ ...s, band });
    }
    return chosen;
};

/** The car's loops: its own recordings before stand-ins, the one covering most bands first (one
 *  microphone for as much of the rev range as possible), the others filling the bands left empty. */
const select = (car, stretches) => {
    const passing = stretches.filter((s) => {
        return !s.failed;
    });
    const coverage = SOURCES[car.id]
        .map(({ id, standIn = false }) => {
            const own = passing.filter((s) => {
                return s.source === id;
            });
            return { own, standIn, bands: fillBands(car, own, []).length };
        })
        .sort((a, b) => {
            return a.standIn - b.standIn || b.bands - a.bands;
        });
    const chosen = coverage.reduce((picked, { own }) => {
        return fillBands(car, own, picked);
    }, []);
    return chosen.sort((a, b) => {
        return a.rpm - b.rpm;
    });
};

/** Writes a car's loops (replacing its folder) and returns its manifest entries. */
const writeLoops = (car, chosen) => {
    const folder = `${OUTPUT}/${car.id}`;
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    const ceiling = 10 ** (PEAK_CEILING_DB / 20);
    return chosen.map((s) => {
        const { loop, match } = makeLoop(s.audio, s.shape);
        const rpm = Math.round(s.rpm);
        let gain = 10 ** ((targetLevel(car, s) - rmsDb(loop)) / 20);
        const peak = Math.max(...loop.map(Math.abs)) * gain;
        if (peak > ceiling) gain *= ceiling / peak;
        const levelled = loop.map((v) => {
            return v * gain;
        });
        const file = `${folder}/${s.load}_${rpm}.wav`;
        writeFileSync(file, wav(levelled));
        console.info(
            `[engine]   ${s.load.padEnd(3)} ${String(rpm).padStart(4)} rpm  ${(loop.length / SAMPLE_RATE).toFixed(2)} s  ` +
                `${s.source} @ ${s.from.toFixed(1)}-${s.to.toFixed(1)} s  slope ${s.slope.toFixed(2)} oct/s  ` +
                `tonal ${s.tonal.toFixed(1)} dB  firing ${s.firing.toFixed(1)} dB  flatness ${s.flatness.toFixed(3)}  ` +
                `drift ${s.drift.toFixed(0)} c  signature ${s.signatureMatch.toFixed(2)}  loop match ${match.toFixed(2)}  ` +
                `level ${rmsDb(levelled).toFixed(1)} dBFS${peak > ceiling ? ' (peak-limited)' : ''}`,
        );
        return { rpm, load: s.load, file };
    });
};

/** manifest.json with one loop per line, cars in line-up order. */
const writeManifest = (manifest) => {
    const cars = CARS.filter((car) => {
        return manifest[car.id]?.length;
    }).map((car) => {
        const lines = manifest[car.id].map(({ rpm, load, file }) => {
            return `        { "rpm": ${rpm}, "load": "${load}", "file": "${file}" }`;
        });
        return `    "${car.id}": [\n${lines.join(',\n')}\n    ]`;
    });
    writeFileSync(MANIFEST, `{\n${cars.join(',\n')}\n}\n`);
};

const args = process.argv.slice(2);
const dumpTracks = args.includes('--track');
const wanted = args.filter((arg) => {
    return !arg.startsWith('--');
});
mkdirSync(WORK, { recursive: true });
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
for (const car of CARS.filter((c) => {
    return !wanted.length || wanted.includes(c.id);
})) {
    const stretches = SOURCES[car.id].flatMap((source) => {
        return stretchesOf(car, source, dumpTracks);
    });
    const failures = {};
    for (const s of stretches) if (s.failed) failures[s.failed] = (failures[s.failed] ?? 0) + 1;
    const passing = stretches.filter((s) => {
        return !s.failed;
    }).length;
    console.info(
        `[engine] ${car.id}: ${passing} of ${stretches.length} stretches pass (failed: ${JSON.stringify(failures)}; ` +
            `thresholds: tonality >= ${MIN_TONAL_DB} dB, firing line >= ${MIN_FIRING_DB} dB, ` +
            `drift <= ${MAX_DRIFT_CENTS} cents, signature >= ${MIN_SIGNATURE_MATCH}, no slip)`,
    );
    if (dumpTracks) {
        const rows = stretches.map(({ audio: _audio, shape, ...s }) => {
            return { ...s, loop: shape.loop };
        });
        writeFileSync(`${WORK}/${car.id}-stretches.json`, JSON.stringify(rows));
    }
    const chosen = select(car, stretches);
    if (dumpTracks) {
        const rows = chosen.map(({ audio: _audio, shape, ...s }) => {
            return { ...s, loop: shape.loop };
        });
        writeFileSync(`${WORK}/${car.id}-chosen.json`, JSON.stringify(rows));
    }
    for (const load of ['on', 'off']) {
        const covered = chosen.some((s) => {
            return s.load === load;
        });
        if (!covered) throw new Error(`${car.id}: no ${load}-load stretch passes the checks; nothing written`);
    }
    manifest[car.id] = writeLoops(car, chosen);
}
writeManifest(manifest);
