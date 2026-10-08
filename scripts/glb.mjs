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

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const FLOAT = 5126;

/** The float values of accessor `index` in the GLB at `path`, whose JSON chunk is `gltf`. */
export function readFloats(path, gltf, index) {
    const bytes = readFileSync(path);
    const accessor = gltf.accessors[index];
    if (accessor.componentType !== FLOAT) throw new Error(`Accessor ${index} is not float data`);
    const view = gltf.bufferViews[accessor.bufferView];
    const components = COMPONENTS[accessor.type];
    const stride = view.byteStride ?? components * 4;
    // The binary chunk follows the JSON chunk and its own 8-byte header.
    const start = 20 + bytes.readUInt32LE(12) + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Float32Array.from({ length: accessor.count * components }, (_, i) => {
        return bytes.readFloatLE(start + Math.floor(i / components) * stride + (i % components) * 4);
    });
}
