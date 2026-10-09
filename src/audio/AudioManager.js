import { renderSound } from './SoundBank.js';
import { RecordedEngineSound, SynthEngineSound } from './EngineSound.js';

const WORKLET_URL = new URL('./worklets/engine-processor.js', import.meta.url);
const ENGINE_MANIFEST = 'assets/audio/engines/manifest.json';
const BUSES = { engine: 0.85, sfx: 0.9, ambience: 0.7, ui: 0.6 };

/** Owns the Web Audio graph: master chain, mix buses, one-shot effects, loops and engine voices. */
export class AudioManager {
    constructor(resources) {
        this.resources = resources;
        this.context = null;
        this.starting = null;
        this.buses = {};
        this.muted = false;
    }

    get ready() {
        return this.context !== null;
    }

    /** Must be called from a user gesture (browsers keep audio locked until then). */
    async unlock() {
        // Quick presses unlock again before the first graph is ready; they share that one start.
        this.starting ??= this._start();
        await this.starting;
        await this.context.resume();
    }

    async _start() {
        const context = new AudioContext({ latencyHint: 'interactive' });
        this.master = new GainNode(context, { gain: this.muted ? 0 : 1 });
        const limiter = new DynamicsCompressorNode(context, {
            threshold: -10,
            knee: 6,
            ratio: 8,
            attack: 0.003,
            release: 0.2,
        });
        this.master.connect(limiter).connect(context.destination);
        for (const [name, level] of Object.entries(BUSES)) {
            this.buses[name] = new GainNode(context, { gain: level });
            this.buses[name].connect(this.master);
        }
        await context.audioWorklet.addModule(WORKLET_URL);
        this.context = context;
    }

    bus(name) {
        return this.buses[name];
    }

    buffer(name) {
        return this.resources.memo(`sound:${name}`, () => {
            return renderSound(this.context, name);
        });
    }

    /** Plays a one-shot effect from the sound bank. */
    play(name, { volume = 1, rate = 1, bus = 'sfx' } = {}) {
        if (!this.context) return;
        const source = new AudioBufferSourceNode(this.context, {
            buffer: this.buffer(name),
            playbackRate: rate,
        });
        const gain = new GainNode(this.context, { gain: volume });
        source.connect(gain).connect(this.buses[bus]);
        source.start();
    }

    /** A looping sound with live volume/rate control; `filter` is an optional BiquadFilter config. */
    loop(name, { bus = 'ambience', filter = null } = {}) {
        const source = new AudioBufferSourceNode(this.context, { buffer: this.buffer(name), loop: true });
        const gain = new GainNode(this.context, { gain: 0 });
        const shaper = filter ? new BiquadFilterNode(this.context, filter) : null;
        (shaper ? source.connect(shaper) : source).connect(gain).connect(this.buses[bus]);
        source.start();
        return { source, gain, filter: shaper };
    }

    /** Engine voice for `car`: real recordings when installed (with the synthesiser past the highest),
     *  otherwise the synthesiser. */
    async createEngine(car) {
        const manifest = await this.resources.json(ENGINE_MANIFEST);
        const entries = manifest[car.id];
        if (entries?.length) {
            const loops = await Promise.all(
                entries.map(async (entry) => {
                    return { ...entry, buffer: await this.resources.audioBuffer(this.context, entry.file) };
                }),
            );
            console.info(`[audio] ${car.fullName}: using ${loops.length} recorded engine loops, the synthesiser above them`);
            return new RecordedEngineSound(this.context, car, this.buses.engine, loops);
        }
        console.info(`[audio] ${car.fullName}: no recordings installed, using the engine synthesiser`);
        return new SynthEngineSound(this.context, car, this.buses.engine);
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05);
    }

    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }
}
