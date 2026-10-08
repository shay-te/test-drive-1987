import { readFileSync } from 'node:fs';

/** Reads the JSON chunk from a self-contained glTF 2.0 binary. */
export function readGlb(path) {
    const bytes = readFileSync(path);
    if (bytes.length < 20 || bytes.toString('utf8', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
        throw new Error(`Invalid GLB header: ${path}`);
    const length = bytes.readUInt32LE(12);
    if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + length > bytes.length)
        throw new Error(`Invalid GLB JSON chunk: ${path}`);
    return JSON.parse(bytes.toString('utf8', 20, 20 + length));
}
