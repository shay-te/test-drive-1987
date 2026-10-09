import { ENGINE_SOUND } from '../config.js';
import { clamp, smoothstep } from '../util/math.js';

/** Cabin acoustics by engine position: how much of the engine reaches the driver's ears. */
const CABIN = {
    front: { lowpass: 2600, boomHz: 95, boomDb: 5 },
    mid: { lowpass: 4200, boomHz: 130, boomDb: 4 },
    rear: { lowpass: 3400, boomHz: 110, boomDb: 4 },
};

/** Base engine voice: a source routed through the car's cabin filter. */
class EngineSound {
    constructor(context, car, destination) {
        this.context = context;
        this.car = car;
        const cabin = CABIN[car.sound.cabin];
        this.lowpass = new BiquadFilterNode(context, { type: 'lowpass', frequency: cabin.lowpass, Q: 0.6 });
        this.boom = new BiquadFilterNode(context, {
            type: 'peaking',
            frequency: cabin.boomHz,
            gain: cabin.boomDb,
            Q: 1.2,
        });
        this.output = new GainNode(context, { gain: ENGINE_SOUND.level });
        this.lowpass.connect(this.boom).connect(this.output).connect(destination);
    }

    stop() {
        this.output.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
        setTimeout(() => {
            return this.output.disconnect();
        }, 400);
    }
}

/** The synthesised engine (AudioWorklet), used when no recordings of the car are installed. */
export class SynthEngineSound extends EngineSound {
    constructor(context, car, destination) {
        super(context, car, destination);
        this.node = new AudioWorkletNode(context, 'engine-processor', {
            outputChannelCount: [1],
            processorOptions: { profile: car.sound },
        });
        this.node.connect(this.lowpass);
        this.params = ['rpm', 'throttle', 'boost', 'running'].reduce((map, name) => {
            map[name] = this.node.parameters.get(name);
            return map;
        }, {});
    }

    /** `running`: false once the engine has stopped (blown, or stalled in a crash): it winds down. */
    update({ rpm, throttle, boost, running }) {
        const now = this.context.currentTime;
        this.params.rpm.setTargetAtTime(rpm, now, 0.015);
        this.params.throttle.setTargetAtTime(throttle, now, 0.03);
        this.params.boost.setTargetAtTime(boost, now, 0.05);
        this.params.running.setTargetAtTime(running ? 1 : 0, now, 0.3);
    }
}

/** Cross-fade weights of loops recorded at ascending `rpms`, at engine speed `rpm`: the loops either side
 *  share it linearly and the outermost loop holds beyond the ends, so the weights always sum to 1. */
export function crossfadeWeights(rpms, rpm) {
    return rpms.map((at, i) => {
        const lower = rpms[i - 1];
        const upper = rpms[i + 1];
        if (rpm < at) return lower === undefined ? 1 : clamp((rpm - lower) / (at - lower), 0, 1);
        return upper === undefined ? 1 : clamp((upper - rpm) / (upper - at), 0, 1);
    });
}

/** Recorded engine loops at several rpm points, cross-faded and pitch-shifted (racing-game style). */
class SampleEngineSound extends EngineSound {
    /** @param {Array<{rpm:number, load:'on'|'off', buffer:AudioBuffer}>} loops */
    constructor(context, car, destination, loops) {
        super(context, car, destination);
        this.loops = loops.map((loop) => {
            const gain = new GainNode(context, { gain: 0 });
            const source = new AudioBufferSourceNode(context, { buffer: loop.buffer, loop: true });
            source.connect(gain).connect(this.lowpass);
            source.start();
            return { ...loop, gain, source };
        });
    }

    update({ rpm, throttle, running }) {
        const now = this.context.currentTime;
        for (const loadType of ['on', 'off']) {
            const loadGain = loadType === 'on' ? throttle : 1 - throttle;
            const set = this.loops
                .filter((l) => {
                    return l.load === loadType;
                })
                .sort((a, b) => {
                    return a.rpm - b.rpm;
                });
            const weights = crossfadeWeights(
                set.map((loop) => {
                    return loop.rpm;
                }),
                rpm,
            );
            set.forEach((loop, i) => {
                loop.gain.gain.setTargetAtTime(running ? weights[i] * loadGain : 0, now, 0.03);
                loop.source.playbackRate.setTargetAtTime(Math.max(0.1, rpm / loop.rpm), now, 0.015);
            });
        }
    }

    stop() {
        super.stop();
        for (const loop of this.loops) loop.source.stop(this.context.currentTime + 0.5);
    }
}

/** The share of the engine heard from recordings whose highest loop is at `topRpm`, at `rpm`: all of it
 *  up to ENGINE_SOUND.recordedReach[0] times that, none past [1]. */
export function recordedShare(topRpm, rpm) {
    const [hold, gone] = ENGINE_SOUND.recordedReach;
    return 1 - smoothstep(topRpm * hold, topRpm * gone, rpm);
}

/** A car's real recordings, handed over to the synthesiser above the highest of them (recordedShare). */
export class RecordedEngineSound {
    /** @param {Array<{rpm:number, load:'on'|'off', buffer:AudioBuffer}>} loops */
    constructor(context, car, destination, loops) {
        this.context = context;
        this.recorded = new SampleEngineSound(context, car, destination, loops);
        this.synth = new SynthEngineSound(context, car, destination);
        this.topRpm = Math.max(...loops.map((loop) => { return loop.rpm; }));
    }

    update(state) {
        const now = this.context.currentTime;
        const share = recordedShare(this.topRpm, state.rpm);
        this.recorded.update(state);
        this.synth.update(state);
        this.recorded.output.gain.setTargetAtTime(ENGINE_SOUND.level * share, now, 0.05);
        this.synth.output.gain.setTargetAtTime(ENGINE_SOUND.level * (1 - share), now, 0.05);
    }

    stop() {
        this.recorded.stop();
        this.synth.stop();
    }
}
