import { createRng, TAU } from '../util/math.js';

/** Seconds between the glugs of air leaving a sinking car. */
const GLUG = 0.11;

/** Procedural sound effects, rendered once into AudioBuffers (the game ships no audio files). */
const SOUNDS = {
    noise: {
        seconds: 2,
        render: (x) => {
            return x.noise();
        },
    },
    beep: {
        seconds: 0.075,
        render: (x) => {
            return Math.sign(Math.sin(TAU * 2350 * x.t)) * 0.35 * x.decay(0.06) * x.attack(0.003);
        },
    },
    click: {
        seconds: 0.035,
        render: (x) => {
            return Math.sin(TAU * 1800 * x.t) * x.decay(0.008) * 0.5;
        },
    },
    shift: {
        seconds: 0.16,
        render: (x) => {
            return (
                (Math.sin(TAU * 95 * x.t) * 0.7 + x.noise() * 0.35) * x.decay(0.035) +
                x.noise() * 0.25 * x.decay(0.008)
            );
        },
    },
    splash: {
        seconds: 1.8,
        render: (x) => {
            const slap = Math.sin(TAU * (70 + 40 * x.decay(0.05)) * x.t) * x.decay(0.12) * 0.8;
            const spray = x.noise() * (0.6 * x.decay(0.4) * x.attack(0.01) + 0.2 * x.decay(1.1));
            return slap + spray;
        },
    },
    bubbles: {
        seconds: 2.5,
        render: (x) => {
            // Glugs: a short rising tone every GLUG seconds, its pitch scattered, fading as the air runs out.
            const n = Math.floor(x.t / GLUG);
            const t = x.t - n * GLUG;
            const scatter = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
            return Math.sin(TAU * (160 + 240 * scatter) * t * (1 + 4 * t)) * Math.exp(-t / 0.03) * 0.5 * x.decay(1.2);
        },
    },
    ding: {
        seconds: 1.4,
        render: (x) => {
            const strike = (t0) => {
                const t = x.t - t0;
                return t < 0
                    ? 0
                    : (Math.sin(TAU * 1180 * t) + 0.5 * Math.sin(TAU * 2950 * t)) * Math.exp(-t / 0.25);
            };
            return (strike(0) + strike(0.32)) * 0.3;
        },
    },
    stamp: {
        seconds: 0.3,
        render: (x) => {
            return (Math.sin(TAU * 140 * x.t) * 0.8 + x.noise() * 0.4) * x.decay(0.05);
        },
    },
    pump: {
        seconds: 1,
        render: (x) => {
            return (
                (Math.sin(TAU * 120 * x.t) * 0.3 + Math.sin(TAU * 360 * x.t) * 0.1 + x.noise() * 0.05) * 0.6
            );
        },
    },
};

/** Renders sound `name` for `context`. */
export function renderSound(context, name) {
    const spec = SOUNDS[name];
    const rate = context.sampleRate;
    const length = Math.round(spec.seconds * rate);
    const buffer = context.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const random = createRng(name.length * 7919 + length);
    const sample = {
        t: 0,
        random,
        noise: () => {
            return random() * 2 - 1;
        },
        decay: (tau) => {
            return Math.exp(-sample.t / tau);
        },
        attack: (tau) => {
            return 1 - Math.exp(-sample.t / tau);
        },
    };
    for (let i = 0; i < length; i++) {
        sample.t = i / rate;
        data[i] = spec.render(sample);
    }
    return buffer;
}
