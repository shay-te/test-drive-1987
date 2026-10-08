/** Physically inspired engine synthesiser: per-cylinder exhaust pulses through resonant pipes.
 *  Configured with a car's `sound` profile (cylinders, firing angles, banks, resonances...). */

const CYCLE = 720;
const TWO_PI = Math.PI * 2;

/** Second-order band-pass filter (RBJ cookbook), constant peak gain. */
class BandPass {
    constructor(freq, q, gain) {
        this.x1 = this.x2 = this.y1 = this.y2 = 0;
        this.configure(freq, q, gain);
    }

    /** Retunes the filter without clearing its state (no clicks). */
    configure(freq, q, gain) {
        const w = (TWO_PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
        const alpha = Math.sin(w) / (2 * q);
        const a0 = 1 + alpha;
        this.b0 = (alpha / a0) * gain;
        this.b2 = (-alpha / a0) * gain;
        this.a1 = (-2 * Math.cos(w)) / a0;
        this.a2 = (1 - alpha) / a0;
    }

    tick(x) {
        const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }
}

/** One exhaust bank: pulse shaping, pipe resonances, a feedback comb (pipe length) and a muffler. */
class ExhaustBank {
    constructor(profile, pipeMs) {
        this.fast = 0;
        this.slow = 0;
        this.fastDecay = Math.exp(-1 / ((profile.pulseMs * 0.45 * sampleRate) / 1000));
        this.slowDecay = Math.exp(-1 / ((profile.pulseMs * sampleRate) / 1000));
        this.resonators = profile.resonances.map(([f, q, g]) => {
            return new BandPass(f, q, g);
        });
        this.delay = new Float32Array(Math.max(8, Math.round((pipeMs * sampleRate) / 1000)));
        this.cursor = 0;
        this.lowpass = 0;
        this.rasp = profile.rasp;
    }

    fire(amplitude) {
        this.fast += amplitude;
        this.slow += amplitude;
    }

    tick(noise, cutoff) {
        this.fast *= this.fastDecay;
        this.slow *= this.slowDecay;
        const pulse = this.slow - this.fast;
        const excitation = pulse * (1 + this.rasp * noise);
        let y = excitation * 0.35;
        for (const r of this.resonators) y += r.tick(excitation);
        const echoed = y + this.delay[this.cursor] * 0.42;
        this.delay[this.cursor] = echoed;
        this.cursor = (this.cursor + 1) % this.delay.length;
        this.lowpass += cutoff * (echoed - this.lowpass);
        return this.lowpass;
    }
}

class EngineProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
            { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'boost', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'running', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        const p = options.processorOptions.profile;
        this.profile = p;
        this.banks = [new ExhaustBank(p, p.pipeMs[0]), new ExhaustBank(p, p.pipeMs[1])];
        this.events = p.firing
            .map((angle, cylinder) => {
                // Small fixed differences between cylinders give the engine its character.
                const character = 1 + p.rasp * 0.18 * Math.sin(cylinder * 2.399 + 1.3);
                return { angle, bank: p.banks[cylinder], character };
            })
            .sort((a, b) => {
                return a.angle - b.angle;
            });
        this.level = 0.9 / Math.sqrt(p.cylinders / 4);
        this.angle = 0;
        this.seed = 22222;
        this.intake = new BandPass(400, 1.4, 1);
        this.intakeLevel = 0;
        this.whistlePhase = 0;
        this.fanPhase = 0;
        this.blowoff = 0;
        this.blowoffFilter = new BandPass(2800, 1.2, 1);
        this.lastThrottle = 0;
        this.dc = 0;
        this.smoothRpm = 900;
    }

    _noise() {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        return this.seed / 2147483648 - 1;
    }

    process(_inputs, outputs, parameters) {
        const output = outputs[0];
        const out = output[0];
        const p = this.profile;
        const targetRpm = parameters.rpm[0];
        const throttle = parameters.throttle[0];
        const boost = parameters.boost[0];
        const running = parameters.running[0];
        const load = 0.32 + 0.68 * throttle;
        const muffle = p.muffle * (1 - 0.45 * throttle);
        const cutoff = 1 - Math.exp((-TWO_PI * (700 + 5200 * (1 - muffle))) / sampleRate);

        if (p.turbo?.blowoff && this.lastThrottle - throttle > 0.4 && boost > 0.45) this.blowoff = boost;
        this.lastThrottle = throttle;
        this.intake.configure(Math.max(120, (targetRpm / 60) * p.cylinders * 0.9), 1.6, 1);

        for (let i = 0; i < out.length; i++) {
            this.smoothRpm += (targetRpm - this.smoothRpm) * 0.002;
            const rpm = this.smoothRpm * running;
            const previous = this.angle;
            this.angle += (rpm * 6) / sampleRate;
            const wrapped = this.angle >= CYCLE;
            if (wrapped) this.angle -= CYCLE;
            for (const e of this.events) {
                const crossed = wrapped
                    ? e.angle >= previous || e.angle < this.angle
                    : e.angle >= previous && e.angle < this.angle;
                if (!crossed) continue;
                const variation = 1 + 0.06 * this._noise();
                let amplitude = load * e.character * variation;
                if (throttle < 0.05 && rpm > 2600 && Math.random() < p.overrunPops * 0.04) amplitude *= 4.5;
                this.banks[e.bank].fire(amplitude);
            }

            const noise = this._noise();
            const a = this.banks[0].tick(noise, cutoff);
            const b = this.banks[1].tick(this._noise(), cutoff);
            const blend = p.bankBlend;
            let y = (a + b) * 0.5 * blend + (a * 0.62 + b * 0.38) * (1 - blend);

            this.intakeLevel += (throttle * p.intake * (rpm / 6000) - this.intakeLevel) * 0.001;
            y += this.intake.tick(noise) * this.intakeLevel * 0.6;

            const crank = rpm / 60;
            this.fanPhase += (crank * 1.8 * 11) / sampleRate;
            y += Math.sin(TWO_PI * this.fanPhase) * p.fan * 0.05 * (crank / 50);
            y += Math.sin(TWO_PI * this.fanPhase * 0.37) * p.mechanical * 0.025 * (crank / 60);

            if (p.turbo) {
                this.whistlePhase += (p.turbo.whistleHz * (0.35 + 0.65 * boost)) / sampleRate;
                const flutter = 1 + p.turbo.flutter * 0.3 * Math.sin(this.whistlePhase * 0.013);
                y += Math.sin(TWO_PI * this.whistlePhase) * p.turbo.whistle * boost * boost * flutter;
                if (this.blowoff > 0.001) {
                    y += this.blowoffFilter.tick(noise) * this.blowoff * p.turbo.blowoff * 0.5;
                    this.blowoff *= 0.99985;
                }
            }

            this.dc += (y - this.dc) * 0.0005;
            out[i] = Math.tanh((y - this.dc) * this.level * 1.6) * 0.8;
        }
        for (let c = 1; c < output.length; c++) output[c].set(out);
        return true;
    }
}

registerProcessor('engine-processor', EngineProcessor);
