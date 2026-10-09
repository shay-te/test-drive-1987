/** Audio helpers shared by the import scripts: decoding a recording with ffmpeg, writing a WAV. */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const PCM_MAX = 32767;
const WAV_HEADER_BYTES = 44;

/** The `source.*` file downloaded into `folder`; `howTo` says where the download is explained. */
export function sourceFile(folder, howTo) {
    const file = readdirSync(folder).find((name) => { return name.startsWith('source.'); });
    if (!file) throw new Error(`${folder} has no source file: download it first (${howTo})`);
    return `${folder}/${file}`;
}

/** A recording decoded to mono float PCM at `rate` Hz (ffmpeg on the PATH, or FFMPEG). */
export function decodeMono(file, rate) {
    const args = ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'];
    const result = spawnSync(FFMPEG, args, { maxBuffer: 1 << 30 });
    if (result.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${result.stderr}`);
    const bytes = result.stdout;
    const pcm = new Float32Array(bytes.length / Float32Array.BYTES_PER_ELEMENT);
    pcm.set(new Float32Array(bytes.buffer, bytes.byteOffset, pcm.length));
    return pcm;
}

/** 16-bit PCM mono WAV bytes of `pcm` (-1..1) at `rate` Hz. */
export function wav(pcm, rate) {
    const bytes = Buffer.alloc(WAV_HEADER_BYTES + pcm.length * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24);
    bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(pcm.length * 2, 40);
    pcm.forEach((v, i) => {
        bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * PCM_MAX), WAV_HEADER_BYTES + i * 2);
    });
    return bytes;
}
