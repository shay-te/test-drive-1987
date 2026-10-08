import { validateCabinNodes } from '../src/world/cabin/cabinAsset.js';
import { readGlb } from './glb.mjs';

const path = process.argv[2] ?? 'assets/models/porsche/cabin.glb';
const asset = readGlb(path);
const bindings = validateCabinNodes(asset.nodes ?? []);
for (const node of Object.values(bindings)) {
    if (node.mesh !== undefined && asset.meshes[node.mesh].primitives.length !== 1)
        throw new Error(`Runtime mesh "${node.name}" must have one primitive`);
}
for (const node of asset.nodes ?? []) {
    if (node.mesh === undefined) continue;
    for (const primitive of asset.meshes[node.mesh].primitives) {
        if (primitive.attributes.TEXCOORD_0 === undefined) throw new Error(`Mesh "${node.name}" has no UVs`);
    }
}
if (asset.buffers?.some((buffer) => { return Boolean(buffer.uri); })) throw new Error('Cabin GLB must embed its buffers');
if (asset.images?.some((image) => { return Boolean(image.uri); })) throw new Error('Cabin GLB must embed its images');
console.info(`Cabin valid: ${path}; ${asset.nodes.length} nodes, ${asset.meshes.length} meshes`);
