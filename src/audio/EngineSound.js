import { clamp } from '../util/math.js';

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
        this.output = new GainNode(context, { gain: 0.9 });
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

    update({ rpm, throttle, boost, blown }) {
        const now = this.context.currentTime;
        this.params.rpm.setTargetAtTime(rpm, now, 0.015);
        this.params.throttle.setTargetAtTime(throttle, now, 0.03);
        this.params.boost.setTargetAtTime(boost, now, 0.05);
        this.params.running.setTargetAtTime(blown ? 0 : 1, now, 0.3);
    }
}

/** Recorded engine loops at several rpm points, cross-faded and pitch-shifted (racing-game style). */
export class SampleEngineSound extends EngineSound {
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

    update({ rpm, throttle, blown }) {
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
            set.forEach((loop, i) => {
                const lower = set[i - 1]?.rpm ?? 0;
                const upper = set[i + 1]?.rpm ?? Infinity;
                const weight =
                    rpm < loop.rpm
                        ? clamp((rpm - lower) / (loop.rpm - lower), 0, 1)
                        : clamp((upper - rpm) / (upper - loop.rpm), 0, 1);
                loop.gain.gain.setTargetAtTime(blown ? 0 : weight * loadGain, now, 0.03);
                loop.source.playbackRate.setTargetAtTime(Math.max(0.1, rpm / loop.rpm), now, 0.015);
            });
        }
    }

    stop() {
        super.stop();
        for (const loop of this.loops) loop.source.stop(this.context.currentTime + 0.5);
    }
}
