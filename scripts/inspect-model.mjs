/** Lists what a downloaded or imported car model contains: credit, materials, and every mesh part with
 *  its triangles and world bounds, largest first. A box `x0,y0,z0,x1,y1,z1` keeps only the parts whose
 *  centre lies inside it (in the file's own space; import with --aligned first for car space).
 *  Usage: node scripts/inspect-model.mjs <model.glb> [box] */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const [path, box] = process.argv.slice(2);
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(path);
const root = doc.getRoot();
const fixed = (values) => { return values.map((v) => { return v.toFixed(3); }).join(','); };

const credit = root.getAsset().extras ?? {};
console.info(`${path}\n  ${credit.title ?? '(untitled)'} by ${credit.author ?? '?'}: ${credit.license ?? 'no license recorded'}`);
const whole = getBounds(root.getDefaultScene());
console.info(`  bounds ${fixed(whole.min)} .. ${fixed(whole.max)}`);
for (const material of root.listMaterials()) {
    const extensions = material.listExtensions().map((e) => { return e.extensionName; }).join(' ');
    console.info(`  material ${material.getName()}: ${material.getAlphaMode()} rgba ${fixed(material.getBaseColorFactor())} ${extensions}`);
}

const [x0, y0, z0, x1, y1, z1] = box ? box.split(',').map(Number) : [];
const inside = (c) => { return !box || (c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1 && c[2] >= z0 && c[2] <= z1); };
const parts = root.listNodes().filter((node) => { return node.getMesh(); }).map((node) => {
    const bounds = getBounds(node);
    const prims = node.getMesh().listPrimitives();
    // Exporters often hang a generic mesh node ("Object_12") under the named part.
    const parent = node.getParentNode();
    return {
        name: parent ? `${parent.getName()}/${node.getName()}` : node.getName(),
        materials: prims.map((p) => { return p.getMaterial()?.getName(); }).join('+'),
        triangles: prims.reduce((n, p) => { return n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; }, 0),
        bounds,
        centre: bounds.min.map((v, i) => { return (v + bounds.max[i]) / 2; }),
    };
}).filter((part) => { return inside(part.centre); }).sort((a, b) => { return b.triangles - a.triangles; });
const total = parts.reduce((n, part) => { return n + part.triangles; }, 0);
console.info(`  ${parts.length} parts, ${total} triangles${box ? ` with centres in ${box}` : ''}`);
for (const part of parts) {
    console.info(`  ${part.name.padEnd(56)} ${part.materials.padEnd(18)} ${String(part.triangles).padStart(7)}  ${fixed(part.bounds.min)} .. ${fixed(part.bounds.max)}`);
}
