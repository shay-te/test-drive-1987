import { clamp, lerp } from '../util/math.js';

const SIREN_RANGE = 700;
const BEEP_SLOW = 0.9;
const BEEP_FAST = 0.11;

/** Maps the driving simulation to sound: engine, tyres, wind, gravel, siren and radar beeps. */
export class DriveSoundscape {
    constructor(audio, engine) {
        this.audio = audio;
        this.engine = engine;
        const context = audio.context;
        this.wind = audio.loop('noise', { filter: { type: 'lowpass', frequency: 500, Q: 0.4 } });
        this.tyres = audio.loop('noise', { bus: 'sfx', filter: { type: 'bandpass', frequency: 1100, Q: 9 } });
        this.gravel = audio.loop('noise', {
            bus: 'sfx',
            filter: { type: 'lowpass', frequency: 380, Q: 0.8 },
        });
        this.siren = new OscillatorNode(context, { type: 'square', frequency: 700 });
        this.sirenTone = new BiquadFilterNode(context, { type: 'lowpass', frequency: 1800 });
        this.sirenGain = new GainNode(context, { gain: 0 });
        this.siren.connect(this.sirenTone).connect(this.sirenGain).connect(audio.bus('sfx'));
        this.siren.start();
        this.sirenPhase = 0;
        this.beepClock = 0;
    }

    /**
     * @param {number} dt
     * @param {object} state telemetry plus `radar` (0..1), `sirenDistance` (m or null), `paused`, and
     *     `engineOff` once a crash has stopped the engine
     */
    update(dt, state) {
        const now = this.audio.context.currentTime;
        const set = (param, value, tau = 0.05) => {
            param.setTargetAtTime(value, now, tau);
        };
        const silent = state.paused ? 0 : 1;
        this.engine.update({ ...state, running: !state.blown && !state.engineOff });

        const speed = clamp(state.speed / 70, 0, 1);
        set(this.wind.gain.gain, silent * speed * speed * 0.32);
        set(this.wind.filter.frequency, 300 + speed * 1500);

        const screech = clamp((state.slip - 0.06) * 6, 0, 1) + state.wheelspin * 0.8;
        const onAsphalt = state.surface === 'asphalt' ? 1 : 0.2;
        set(
            this.tyres.gain.gain,
            silent * clamp(screech, 0, 1) * 0.35 * onAsphalt * (state.speed > 3 ? 1 : 0),
        );
        set(this.tyres.filter.frequency, 950 + 250 * Math.sin(now * 13));
        set(
            this.gravel.gain.gain,
            silent * (state.surface === 'gravel' ? clamp(state.speed / 25, 0, 1) * 0.6 : 0),
        );

        this._siren(dt, state, set, silent);
        this._radar(dt, state.radar * silent);
    }

    _siren(dt, state, set, silent) {
        const distance = state.sirenDistance;
        const level = distance === null ? 0 : clamp(1 - distance / SIREN_RANGE, 0, 1);
        this.sirenPhase += dt;
        const wail = 0.5 + 0.5 * Math.sin(this.sirenPhase * Math.PI * 0.7);
        set(this.siren.frequency, lerp(620, 1350, wail), 0.02);
        set(this.sirenGain.gain, silent * level * level * 0.12, 0.1);
    }

    _radar(dt, signal) {
        if (signal <= 0.02) {
            this.beepClock = 0;
            return;
        }
        this.beepClock -= dt;
        if (this.beepClock <= 0) {
            this.audio.play('beep', { volume: 0.35, bus: 'ui' });
            this.beepClock = lerp(BEEP_SLOW, BEEP_FAST, signal);
        }
    }

    stop() {
        for (const loop of [this.wind, this.tyres, this.gravel]) loop.source.stop();
        this.siren.stop();
        this.engine.stop();
    }
}
