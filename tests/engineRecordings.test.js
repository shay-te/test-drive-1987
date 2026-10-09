import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CARS } from '../src/data/cars.js';
import { crossfadeWeights, recordedShare } from '../src/audio/EngineSound.js';
import { ENGINE_SOUND } from '../src/config.js';

const MANIFEST = 'assets/audio/engines/manifest.json';
const PCM_FORMAT = 1;
const BITS = 16;
const PCM_SCALE = 32768;
const MIN_LOOP_SECONDS = 0.5;
/** Seamless: the step from a loop's last sample back to its first is small next to the loop's RMS
 *  and no bigger than the steps inside the loop. */
const MAX_WRAP_STEP_RMS = 0.5;
const RPM_STEP = 25;
const WEIGHT_TOLERANCE = 1e-9;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = Object.entries(manifest).flatMap(([car, loops]) => {
    return loops.map((loop) => {
        return { car, ...loop };
    });
});

/** Reads a WAV file's format chunk and its 16-bit samples, scaled to -1..1. */
function readWav(path) {
    const bytes = readFileSync(path);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${path}: not a RIFF file`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', `${path}: not a WAVE file`);
    const chunks = {};
    for (let at = 12; at + 8 <= bytes.length; ) {
        const size = bytes.readUInt32LE(at + 4);
        chunks[bytes.toString('ascii', at, at + 4)] = bytes.subarray(at + 8, at + 8 + size);
        at += 8 + size + (size % 2);
    }
    const fmt = chunks['fmt '];
    const data = chunks.data;
    assert.ok(fmt && data, `${path}: missing fmt or data chunk`);
    const samples = Float64Array.from({ length: data.length / 2 }, (_, i) => {
        return data.readInt16LE(i * 2) / PCM_SCALE;
    });
    return {
        format: fmt.readUInt16LE(0),
        channels: fmt.readUInt16LE(2),
        sampleRate: fmt.readUInt32LE(4),
        bits: fmt.readUInt16LE(14),
        samples,
    };
}

test('the engine manifest lists recordings for every car of the line-up', () => {
    assert.deepEqual(
        Object.keys(manifest).sort(),
        CARS.map((car) => {
            return car.id;
        }).sort(),
    );
});

test('each car has on-load and off-load loops, sorted by rpm within its rev range', () => {
    for (const car of CARS) {
        const loops = manifest[car.id];
        const loads = new Set(
            loops.map((loop) => {
                return loop.load;
            }),
        );
        assert.deepEqual([...loads].sort(), ['off', 'on'], `${car.id}: needs both loads`);
        const rpms = loops.map((loop) => {
            return loop.rpm;
        });
        assert.deepEqual(rpms, [...rpms].sort((a, b) => {
            return a - b;
        }), `${car.id}: loops not sorted by rpm`);
        for (const rpm of rpms) {
            assert.ok(rpm >= car.engine.idleRpm / 2 && rpm <= car.engine.maxRpm, `${car.id}: ${rpm} rpm out of range`);
        }
    }
});

test('every loop is a 16-bit mono PCM WAV of at least half a second', () => {
    for (const { car, file } of entries) {
        assert.ok(existsSync(file), `${car}: ${file} is missing`);
        const wav = readWav(file);
        assert.equal(wav.format, PCM_FORMAT, `${file}: not PCM`);
        assert.equal(wav.channels, 1, `${file}: not mono`);
        assert.equal(wav.bits, BITS, `${file}: not 16-bit`);
        assert.ok(wav.samples.length / wav.sampleRate >= MIN_LOOP_SECONDS, `${file}: shorter than ${MIN_LOOP_SECONDS} s`);
    }
});

test('every loop wraps seamlessly from its last sample back to its first', () => {
    for (const { file } of entries) {
        const { samples } = readWav(file);
        const rms = Math.sqrt(
            samples.reduce((sum, v) => {
                return sum + v * v;
            }, 0) / samples.length,
        );
        let largestStep = 0;
        for (let i = 1; i < samples.length; i++) largestStep = Math.max(largestStep, Math.abs(samples[i] - samples[i - 1]));
        const wrap = Math.abs(samples[0] - samples[samples.length - 1]);
        assert.ok(rms > 0, `${file}: silent`);
        assert.ok(wrap <= MAX_WRAP_STEP_RMS * rms, `${file}: wrap step ${(wrap / rms).toFixed(2)} x RMS`);
        assert.ok(wrap <= largestStep, `${file}: wrap step larger than any step inside the loop`);
    }
});

test('the loops of each load share every engine speed from half idle to the rev limiter', () => {
    for (const car of CARS) {
        for (const load of ['on', 'off']) {
            const rpms = manifest[car.id]
                .filter((loop) => {
                    return loop.load === load;
                })
                .map((loop) => {
                    return loop.rpm;
                });
            for (let rpm = car.engine.idleRpm / 2; rpm <= car.engine.maxRpm; rpm += RPM_STEP) {
                const weights = crossfadeWeights(rpms, rpm);
                const total = weights.reduce((sum, w) => {
                    return sum + w;
                }, 0);
                assert.ok(weights.every(Number.isFinite), `${car.id} ${load} @ ${rpm}: non-finite weight`);
                assert.ok(Math.abs(total - 1) < WEIGHT_TOLERANCE, `${car.id} ${load} @ ${rpm}: weights sum to ${total}`);
            }
        }
    }
});

test('recordings carry the engine up to a little past the highest of them, then the synthesiser takes over', () => {
    const [hold, gone] = ENGINE_SOUND.recordedReach;
    const manifest = JSON.parse(readFileSync(MANIFEST));
    for (const car of CARS) {
        const top = Math.max(...manifest[car.id].map((loop) => { return loop.rpm; }));
        assert.equal(recordedShare(top, car.engine.idleRpm), 1, `${car.id} idles on its recordings`);
        assert.equal(recordedShare(top, top * hold), 1);
        assert.equal(recordedShare(top, top * gone), 0, 'never pitched up past the reach');
        let last = 1;
        for (let rpm = top; rpm < top * gone; rpm += 25) {
            const share = recordedShare(top, rpm);
            assert.ok(share <= last + 1e-12, 'handed over smoothly, one way');
            last = share;
        }
    }
});
