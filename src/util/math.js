/** Pure, deterministic math helpers shared by simulation and rendering. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => {
    return v < lo ? lo : v > hi ? hi : v;
};
export const lerp = (a, b, t) => {
    return a + (b - a) * t;
};
export const invLerp = (a, b, v) => {
    return b === a ? 0 : (v - a) / (b - a);
};
export const smoothstep = (a, b, v) => {
    const t = clamp(invLerp(a, b, v), 0, 1);
    return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => {
    return 0.5 - Math.cos(clamp(t, 0, 1) * Math.PI) / 2;
};
export const sign = (v) => {
    return v < 0 ? -1 : 1;
};

/** Exponential approach of `current` towards `target` (frame-rate independent). */
export const approach = (current, target, rate, dt) => {
    return target + (current - target) * Math.exp(-rate * dt);
};

/** Moves `current` towards `target` by at most `step`. */
export const moveTowards = (current, target, step) => {
    return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
};

export const wrapAngle = (a) => {
    a = (a + Math.PI) % TAU;
    return (a < 0 ? a + TAU : a) - Math.PI;
};

/** Seeded PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function createRng(seed) {
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => {
        return lo + (hi - lo) * next();
    };
    next.int = (lo, hi) => {
        return Math.floor(lo + (hi - lo + 1) * next());
    };
    next.pick = (arr) => {
        return arr[Math.floor(next() * arr.length)];
    };
    next.chance = (p) => {
        return next() < p;
    };
    return next;
}

/** Integer hash -> float in [0, 1). */
export function hash01(n) {
    n = n ^ 61 ^ (n >>> 16);
    n = Math.imul(n, 9);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
}

/** Seeded 3D gradient noise (Perlin's improved noise), output roughly in [-1, 1]. */
export class Noise {
    constructor(seed = 1) {
        const rng = createRng(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    noise3(x, y, z) {
        const P = this.perm;
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = fade(x);
        const v = fade(y);
        const w = fade(z);
        const A = P[X] + Y;
        const AA = P[A] + Z;
        const AB = P[A + 1] + Z;
        const B = P[X + 1] + Y;
        const BA = P[B] + Z;
        const BB = P[B + 1] + Z;
        return lerp(
            lerp(
                lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u),
                lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u),
                v,
            ),
            lerp(
                lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u),
                lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u),
                v,
            ),
            w,
        );
    }

    noise2(x, y) {
        return this.noise3(x, y, 0.5);
    }

    noise1(x) {
        return this.noise3(x, 0.5, 0.5);
    }

    /** Fractal Brownian motion. */
    fbm3(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
        let amp = 1;
        let freq = 1;
        let sum = 0;
        let norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * this.noise3(x * freq, y * freq, z * freq);
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return sum / norm;
    }

    fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
        return this.fbm3(x, y, 0.37, octaves, lacunarity, gain);
    }

    /** Ridged multifractal, useful for mountain ranges. Output in [0, 1]. */
    ridged2(x, y, octaves = 5) {
        let amp = 0.5;
        let freq = 1;
        let sum = 0;
        let weight = 1;
        for (let i = 0; i < octaves; i++) {
            let n = 1 - Math.abs(this.noise3(x * freq, y * freq, 0.71));
            n *= n * weight;
            weight = clamp(n * 2, 0, 1);
            sum += n * amp;
            freq *= 2.1;
            amp *= 0.5;
        }
        return sum;
    }
}

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
