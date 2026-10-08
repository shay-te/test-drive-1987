import { createRng, TAU } from '../util/math.js';

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
    crash: {
        seconds: 2.4,
        render: (x) => {
            const thump = Math.sin(TAU * (55 + 30 * x.decay(0.1)) * x.t) * x.decay(0.25);
            const debris = x.noise() * (0.55 * x.decay(0.35) + 0.15 * x.decay(1.2));
            const metal =
                (Math.sin(TAU * 412 * x.t) +
                    Math.sin(TAU * 731 * x.t) * 0.7 +
                    Math.sin(TAU * 1193 * x.t) * 0.5) *
                0.18 *
                x.decay(0.6);
            const glass = x.t > 0.05 && x.random() < 0.02 * x.decay(0.5) ? x.noise() * 0.9 : 0;
            return thump + debris + metal + glass;
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

export const SOUND_NAMES = Object.keys(SOUNDS);

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
