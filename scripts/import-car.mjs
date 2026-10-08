/** Converts a downloaded car model into the game's cabin asset: car space, budgets, runtime parts.
 *  Tools: npm i --no-save --no-package-lock @gltf-transform/core@4 @gltf-transform/functions@4
 *         @gltf-transform/extensions@4 meshoptimizer@0 sharp@0
 *  Usage: node scripts/import-car.mjs <carId> [--aligned <out.glb>]  (reads assets/models/<carId>/import.json) */
import { readFileSync } from 'node:fs';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
    clearNodeParent, clearNodeTransform, cloneDocument, compactPrimitive, dedup, getBounds, joinPrimitives, metalRough, prune,
    transformMesh, weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { CLUSTERS, clusterBounds } from '../src/cockpit/clusters.js';
import { carById } from '../src/data/cars.js';
import { CABIN } from '../src/world/cabin/cabinLayout.js';

/** Whole-asset triangle target, under the 100k budget with room for the generated parts. */
const TRIANGLE_TARGET = 95_000;
/** Triangles the generated rig adds (lever, knob, housings, LEDs, surfaces), with margin. */
const GENERATED_TRIANGLES = 2_000;
/** Bounds of the absolute simplification error searched for that target, in metres. */
const SIMPLIFY_ERROR = { min: 0.0001, max: 0.05, steps: 14 };
/** Thickness of the steering wheel slice whose centre is the hub, from its driver-side face. */
const WHEEL_FACE_DEPTH = 0.04;
/** Display surfaces float this far off the faces they cover. */
const SURFACE_OFFSET = 0.003;
const ROUND_SEGMENTS = 16;
const MIRROR = { housingDepth: 0.03, stem: [0.02, 0.02, 0.02] };
const LED_SIZE = [0.007, 0.005, 0.003];
const LEVER = { stickRadius: 0.006, gate: [0.09, 0.006, 0.12], boot: { radius: 0.05, height: 0.07 } };
const RIG_MATERIALS = {
    black: { color: [0.02, 0.02, 0.02, 1], roughness: 0.55, metallic: 0 },
    chrome: { color: [0.85, 0.86, 0.88, 1], roughness: 0.32, metallic: 1 },
    display: { color: [0.05, 0.05, 0.05, 1], roughness: 0.5, metallic: 0 },
};

const [carId, flag, alignedPath] = process.argv.slice(2);
const car = carById(carId);
if (car.id !== carId) throw new Error(`Unknown car "${carId}"`);
const folder = `assets/models/${car.id}`;
const config = JSON.parse(readFileSync(`${folder}/import.json`, 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let doc = await io.read(`${folder}/${config.source}`);

const sub = (a, b) => { return a.map((v, i) => { return v - b[i]; }); };
const add = (a, b) => { return a.map((v, i) => { return v + b[i]; }); };
const scale = (a, k) => { return a.map((v) => { return v * k; }); };
const dot = (a, b) => { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
const cross = (a, b) => { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
const unit = (a) => { return scale(a, 1 / Math.hypot(...a)); };

/** Every node under `node`, depth first, including `node`. */
function subtree(node) {
    return [node, ...node.listChildren().flatMap(subtree)];
}

const scene = () => { return doc.getRoot().getDefaultScene(); };
const named = (names) => {
    return doc.getRoot().listNodes().filter((node) => { return names.includes(node.getName()); });
};
const allPrimitives = () => { return doc.getRoot().listMeshes().flatMap((m) => { return m.listPrimitives(); }); };
const triangles = (prim) => { return (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3; };
const countTriangles = () => {
    return allPrimitives().reduce((n, p) => { return n + triangles(p); }, 0);
};

/** Drops the named parts (and everything attached to them). */
function removeParts(names) {
    for (const node of named(names)) for (const part of subtree(node)) part.dispose();
}

/** Moves the named parts onto a translucent copy of their material ({ material, parts }), so a
 *  texture atlas can stay opaque on the body while its window regions keep their alpha. */
function splitTranslucent(spec) {
    const material = doc.getRoot().listMaterials().find((m) => { return m.getName() === spec.material; });
    const glass = material.clone().setName(`${spec.material} • translucent`).setAlphaMode('BLEND');
    for (const part of named(spec.parts)) {
        for (const node of subtree(part)) for (const prim of node.getMesh()?.listPrimitives() ?? []) prim.setMaterial(glass);
    }
}

/** Applies per-material fixes: { name: { alphaMode, color, opacity, roughness, metallic, doubleSided, transmission, as } }. */
function fixMaterials(fixes) {
    const materials = doc.getRoot().listMaterials();
    for (const material of materials) {
        const fix = fixes[material.getName()];
        if (!fix) continue;
        if (fix.as) {
            const target = materials.find((m) => { return m.getName() === fix.as; });
            for (const prim of allPrimitives()) {
                if (prim.getMaterial() === material) prim.setMaterial(target);
            }
            continue;
        }
        if (fix.alphaMode) material.setAlphaMode(fix.alphaMode);
        if (fix.color || fix.opacity !== undefined) {
            const [r, g, b, a] = material.getBaseColorFactor();
            material.setBaseColorFactor([...(fix.color ?? [r, g, b]), fix.opacity ?? a]);
        }
        if (fix.roughness !== undefined) material.setRoughnessFactor(fix.roughness);
        if (fix.metallic !== undefined) material.setMetallicFactor(fix.metallic);
        if (fix.doubleSided !== undefined) material.setDoubleSided(fix.doubleSided);
        // Transmission costs three.js an extra render pass; plain alpha blending reads the same in a cabin.
        if (fix.transmission === false) material.setExtension('KHR_materials_transmission', null);
    }
}

/** Turns the model nose-first along -z, scales it to the car's length and puts the seated eye at the
 *  origin: nose `body.eye` ahead, wheels on y = 0, centred across on `config.centreOn` (or the whole). */
function align() {
    const turn = (config.yawDeg * Math.PI) / 360;
    const root = doc.createNode('align').setRotation([0, Math.sin(turn), 0, Math.cos(turn)]);
    for (const child of scene().listChildren()) {
        scene().removeChild(child);
        root.addChild(child);
    }
    scene().addChild(root);
    const whole = getBounds(scene());
    const across = config.centreOn ? getBounds(named([config.centreOn])[0]) : whole;
    const s = car.body.length / (whole.max[2] - whole.min[2]);
    root.setScale([s, s, s]);
    root.setTranslation([-s * (across.min[0] + across.max[0]) / 2, -s * whole.min[1], -car.body.eye - s * whole.min[2]]);
}

/** Bakes every mesh node's world transform into its geometry and drops the empty hierarchy. A generic
 *  exporter mesh ("Object_12") that is its parent's only child takes the parent's name. */
function bake() {
    for (const node of scene().listChildren().flatMap(subtree)) {
        if (!node.getMesh()) continue;
        const parent = node.getParentNode();
        if (/^Object_\d+$/.test(node.getName()) && parent?.listChildren().length === 1) node.setName(parent.getName());
        clearNodeParent(node);
        clearNodeTransform(node);
    }
    for (const node of scene().listChildren()) if (!node.getMesh()) for (const part of subtree(node)) part.dispose();
}

/** Positions (and the triangles' corner indices) of a primitive as plain arrays. */
function readPrimitive(prim) {
    const position = prim.getAttribute('POSITION').getArray();
    const index = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: position.length / 3 }, (_, i) => { return i; });
    return { position, index };
}

const buffer = () => { return doc.getRoot().listBuffers()[0]; };
const accessor = (type, array) => { return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer()); };

/** A glTF primitive from plain geometry arrays: { position, normal, uv, index }. */
function primitive(geometry, material) {
    return doc.createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(geometry.position)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(geometry.normal)))
        .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(geometry.uv)))
        .setIndices(accessor('SCALAR', new Uint32Array(geometry.index)))
        .setMaterial(material);
}

function meshNode(name, geometry, material) {
    return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive(geometry, material)));
}

/** Splits the triangles of the named glass for which `keep(centroid, normal)` holds into their own node. */
function splitTriangles(node, keep, name) {
    const prim = node.getMesh().listPrimitives()[0];
    const { position, index } = readPrimitive(prim);
    const normals = prim.getAttribute('NORMAL').getArray();
    const kept = [];
    const rest = [];
    for (let t = 0; t < index.length; t += 3) {
        const corners = [0, 1, 2].map((k) => { return Array.from(position.subarray(index[t + k] * 3, index[t + k] * 3 + 3)); });
        const centroid = scale(corners.reduce(add), 1 / 3);
        const normal = unit(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
        (keep(centroid, normal) ? kept : rest).push(index[t], index[t + 1], index[t + 2]);
    }
    if (!kept.length) throw new Error(`No triangles of "${node.getName()}" matched the windshield region`);
    const geometry = { position: [], normal: [], uv: [], index: [] };
    const remap = new Map();
    for (const i of kept) {
        if (!remap.has(i)) {
            remap.set(i, remap.size);
            geometry.position.push(...position.subarray(i * 3, i * 3 + 3));
            geometry.normal.push(...normals.subarray(i * 3, i * 3 + 3));
            geometry.uv.push(0, 0);
        }
        geometry.index.push(remap.get(i));
    }
    prim.setIndices(accessor('SCALAR', new Uint32Array(rest)));
    compactPrimitive(prim);
    const part = meshNode(name, geometry, prim.getMaterial());
    scene().addChild(part);
    return part;
}

/** The windshield as its own mesh: a whole named node, or the triangles of one inside a box and
 *  facing along `facing` (cosine at least `cos`). */
function extractWindshield(spec) {
    const [node] = named([spec.node]);
    if (!spec.box) {
        node.setName('windshield_surface');
        return node;
    }
    const [x0, y0, z0, x1, y1, z1] = spec.box;
    return splitTriangles(node, (c, n) => {
        const inside = c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1 && c[2] >= z0 && c[2] <= z1;
        return inside && Math.abs(dot(n, spec.facing)) >= spec.cos;
    }, 'windshield_surface');
}

/** Planar UVs over the windshield: U left to right, V from the top edge (0) down to the bottom (1). */
function mapWindshield(node) {
    const prim = node.getMesh().listPrimitives()[0];
    const position = prim.getAttribute('POSITION').getArray();
    let normal = [0, 0, 0];
    let reference = null;
    const { index } = readPrimitive(prim);
    for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => { return Array.from(position.subarray(index[t + k] * 3, index[t + k] * 3 + 3)); });
        const face = cross(sub(b, a), sub(c, a));
        reference ??= face;
        // Glass modelled as two layers faces both ways; count every face on one side.
        normal = add(normal, dot(face, reference) < 0 ? scale(face, -1) : face);
    }
    if (!(Math.hypot(...normal) > 0)) throw new Error('The windshield has no area to map');
    normal = unit(normal);
    const across = unit(sub([1, 0, 0], scale(normal, normal[0])));
    let down = cross(normal, across);
    if (down[1] > 0) down = scale(down, -1);
    const u = [];
    const v = [];
    for (let i = 0; i < position.length; i += 3) {
        const p = Array.from(position.subarray(i, i + 3));
        u.push(dot(p, across));
        v.push(dot(p, down));
    }
    const span = (values) => { return [Math.min(...values), Math.max(...values)]; };
    const [u0, u1] = span(u);
    const [v0, v1] = span(v);
    const uv = new Float32Array(u.length * 2);
    u.forEach((value, i) => {
        uv[i * 2] = (value - u0) / (u1 - u0);
        uv[i * 2 + 1] = (v[i] - v0) / (v1 - v0);
    });
    prim.setAttribute('TEXCOORD_0', accessor('VEC2', uv));
}

/** Symmetric 3x3 eigen-decomposition (Jacobi); returns eigenvectors sorted by ascending eigenvalue. */
function eigenvectors(m) {
    const a = m.map((row) => { return [...row]; });
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 32; sweep++) {
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (Math.abs(a[p][q]) < 1e-12) continue;
            const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1);
            const s = t * c;
            for (let k = 0; k < 3; k++) {
                const [akp, akq] = [a[k][p], a[k][q]];
                a[k][p] = c * akp - s * akq;
                a[k][q] = s * akp + c * akq;
            }
            for (let k = 0; k < 3; k++) {
                const [apk, aqk] = [a[p][k], a[q][k]];
                a[p][k] = c * apk - s * aqk;
                a[q][k] = s * apk + c * aqk;
            }
            for (let k = 0; k < 3; k++) {
                const [vkp, vkq] = [v[k][p], v[k][q]];
                v[k][p] = c * vkp - s * vkq;
                v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    return [0, 1, 2].sort((i, j) => { return a[i][i] - a[j][j]; }).map((i) => { return [v[0][i], v[1][i], v[2][i]]; });
}

/** Unit quaternion of the rotation whose columns are the axes x, y, z. */
function quaternion([x, y, z]) {
    const trace = x[0] + y[1] + z[2];
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1);
        return [(y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s, 0.25 / s];
    }
    if (x[0] > y[1] && x[0] > z[2]) {
        const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
        return [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
    }
    if (y[1] > z[2]) {
        const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
        return [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
    }
    const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
    return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s];
}

/** Axes of a frame whose +z is `normal` and whose +y leans towards world up. */
function frame(normal) {
    const z = unit(normal);
    const x = unit(cross([0, 1, 0], z));
    return [x, cross(z, x), z];
}

/** Hangs the named wheel meshes on `wheel_mount` (hub centre, +z along the column towards the driver)
 *  under a neutral `steering_wheel`, which the runtime turns about its local z; `material` recolours it. */
function mountSteeringWheel({ parts: names, material }, eye) {
    const parts = named(names);
    if (material) {
        const recolour = doc.getRoot().listMaterials().find((m) => { return m.getName() === material; });
        for (const part of parts) for (const prim of part.getMesh().listPrimitives()) prim.setMaterial(recolour);
    }
    const points = [];
    for (const part of parts) {
        for (const prim of part.getMesh().listPrimitives()) {
            const position = prim.getAttribute('POSITION').getArray();
            for (let i = 0; i < position.length; i += 3) points.push([position[i], position[i + 1], position[i + 2]]);
        }
    }
    const mean = scale(points.reduce(add), 1 / points.length);
    const covariance = [0, 1, 2].map((r) => {
        return [0, 1, 2].map((c) => {
            return points.reduce((sum, p) => { return sum + (p[r] - mean[r]) * (p[c] - mean[c]); }, 0) / points.length;
        });
    });
    let axis = eigenvectors(covariance)[0];
    if (dot(axis, sub(eye, mean)) < 0) axis = scale(axis, -1);
    const face = Math.max(...points.map((p) => { return dot(sub(p, mean), axis); }));
    const hub = points.filter((p) => { return dot(sub(p, mean), axis) > face - WHEEL_FACE_DEPTH; });
    const centre = scale(hub.reduce(add), 1 / hub.length);
    const axes = frame(axis);
    const mount = doc.createNode('wheel_mount').setTranslation(centre).setRotation(quaternion(axes));
    const wheel = doc.createNode('steering_wheel');
    mount.addChild(wheel);
    // Into the mount's frame: rotate by the transposed axes after moving the hub to the origin.
    const [x, y, z] = axes;
    hang(parts, wheel, [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -dot(x, centre), -dot(y, centre), -dot(z, centre), 1]);
    scene().addChild(mount);
}

/** Moves baked parts under `parent`, re-expressing their geometry in its frame with the `toLocal` matrix. */
function hang(parts, parent, toLocal) {
    for (const part of parts) {
        transformMesh(part.getMesh(), toLocal);
        scene().removeChild(part);
        parent.addChild(part);
    }
}

/** Hangs the model's own gear lever parts on a `gear_lever` pivot at `base`, which the runtime tilts. */
function mountLever({ parts, base }) {
    const pivot = doc.createNode('gear_lever').setTranslation(base);
    hang(named(parts), pivot, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -base[0], -base[1], -base[2], 1]);
    scene().addChild(pivot);
}

/** Keeps only the `semantics` vertex attributes on every primitive. */
function keepAttributes(semantics) {
    for (const prim of allPrimitives()) {
        for (const semantic of prim.listSemantics()) if (!semantics.includes(semantic)) prim.setAttribute(semantic, null);
    }
}

/** Adds zero UVs where a primitive has none, so every mesh shares one vertex layout. */
function ensureUVs() {
    for (const prim of allPrimitives()) {
        if (prim.getAttribute('TEXCOORD_0')) continue;
        prim.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(prim.getAttribute('POSITION').getCount() * 2)));
    }
}

/** Rebuilds normals: smooth across edges gentler than `creaseDeg`, split into hard edges beyond it. */
function creaseNormals(prim, creaseDeg) {
    const { position, index } = readPrimitive(prim);
    const limit = Math.cos((creaseDeg * Math.PI) / 180);
    const corner = (i) => { return Array.from(position.subarray(i * 3, i * 3 + 3)); };
    const weighted = [];
    const around = new Map();
    for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => { return corner(index[t + k]); });
        weighted.push(cross(sub(b, a), sub(c, a)));
        for (let k = 0; k < 3; k++) {
            if (!around.has(index[t + k])) around.set(index[t + k], []);
            around.get(index[t + k]).push(t / 3);
        }
    }
    const faces = weighted.map((n) => { return Math.hypot(...n) > 0 ? unit(n) : [0, 1, 0]; });
    const out = { position: [], normal: [], index: [] };
    const vertices = new Map();
    index.forEach((v, i) => {
        const face = Math.floor(i / 3);
        const sum = around.get(v).filter((g) => { return dot(faces[g], faces[face]) >= limit; })
            .reduce((n, g) => { return add(n, weighted[g]); }, [0, 0, 0]);
        const n = Math.hypot(...sum) > 0 ? unit(sum) : faces[face];
        const key = `${v}:${n.map((c) => { return Math.round(c * 1000); })}`;
        if (!vertices.has(key)) {
            vertices.set(key, vertices.size);
            out.position.push(...corner(v));
            out.normal.push(...n);
        }
        out.index.push(vertices.get(key));
    });
    prim.setAttribute('POSITION', accessor('VEC3', new Float32Array(out.position)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(out.normal)))
        .setIndices(accessor('SCALAR', new Uint32Array(out.index)));
}

/** Error-driven decimation in metres: dense small parts collapse first, broad panels keep their shape.
 *  `config.pruneBelow` first drops loose pieces smaller than that (tread blocks, tiny badges). */
function decimate(error) {
    for (const prim of allPrimitives()) {
        const { position, index } = readPrimitive(prim);
        const positions = Float32Array.from(position);
        let indices = Uint32Array.from(index);
        if (config.pruneBelow) {
            indices = MeshoptSimplifier.simplifyPrune(indices, positions, 3, config.pruneBelow / MeshoptSimplifier.getScale(positions, 3));
        }
        const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, 0, error, ['ErrorAbsolute']);
        if (simplified.length === index.length) continue;
        prim.setIndices(accessor('SCALAR', simplified));
        compactPrimitive(prim);
    }
}

/** Finds, by bisection on the error, the gentlest decimation that brings the model under `target`. */
async function decimateTo(target) {
    await MeshoptSimplifier.ready;
    const original = doc;
    let [lo, hi] = [SIMPLIFY_ERROR.min, SIMPLIFY_ERROR.max];
    let best = null;
    for (let step = 0; step < SIMPLIFY_ERROR.steps; step++) {
        const error = Math.sqrt(lo * hi);
        doc = cloneDocument(original);
        decimate(error);
        if (countTriangles() <= target) {
            best = { doc, error };
            hi = error;
        } else lo = error;
    }
    if (!best) throw new Error(`Cannot reach ${target} triangles within ${SIMPLIFY_ERROR.max} m of error`);
    doc = best.doc;
    console.info(`decimated within ${(best.error * 1000).toFixed(2)} mm to ${countTriangles()} triangles`);
}

/** Joins the remaining scene-root meshes into one `static_` batch per material. */
function batchStatic() {
    const byMaterial = new Map();
    for (const node of scene().listChildren()) {
        if (!node.getMesh() || node.getName() === 'windshield_surface') continue;
        for (const prim of node.getMesh().listPrimitives()) {
            const list = byMaterial.get(prim.getMaterial()) ?? [];
            list.push(prim);
            byMaterial.set(prim.getMaterial(), list);
        }
        node.dispose();
    }
    for (const [material, prims] of byMaterial) {
        const name = staticName(material.getName());
        const joined = joinPrimitives(prims);
        scene().addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(joined)));
    }
}

/** Flat-shaded axis-aligned box centred on the origin. */
function box([w, h, d]) {
    const geometry = { position: [], normal: [], uv: [], index: [] };
    const half = [w / 2, h / 2, d / 2];
    for (const [axis, u, v] of [[0, 2, 1], [1, 0, 2], [2, 0, 1]]) {
        for (const sign of [1, -1]) {
            const base = geometry.position.length / 3;
            const n = [0, 0, 0];
            n[axis] = sign;
            for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                const p = [0, 0, 0];
                p[axis] = sign * half[axis];
                p[u] = a * half[u];
                p[v] = b * half[v];
                geometry.position.push(...p);
                geometry.normal.push(...n);
                geometry.uv.push((a + 1) / 2, (1 - b) / 2);
            }
            const outward = dot(cross(sub(geometry.position.slice(base * 3 + 3, base * 3 + 6), geometry.position.slice(base * 3, base * 3 + 3)),
                sub(geometry.position.slice(base * 3 + 6, base * 3 + 9), geometry.position.slice(base * 3, base * 3 + 3))), n) > 0;
            geometry.index.push(...(outward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((i) => { return base + i; }));
        }
    }
    return geometry;
}

/** A display quad facing +z, UVs top-down (V = 0 on the top edge) as the runtime surfaces expect. */
function quad(w, h) {
    return {
        position: [-w / 2, h / 2, 0, w / 2, h / 2, 0, w / 2, -h / 2, 0, -w / 2, -h / 2, 0],
        normal: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        uv: [0, 0, 1, 0, 1, 1, 0, 1],
        index: [0, 3, 2, 0, 2, 1],
    };
}

/** Surface of revolution about +y from a [radius, y] profile, with smooth normals. */
function lathe(profile) {
    const geometry = { position: [], normal: [], uv: [], index: [] };
    profile.forEach(([r, y], row) => {
        const prev = profile[Math.max(0, row - 1)];
        const next = profile[Math.min(profile.length - 1, row + 1)];
        const slope = [next[1] - prev[1], -(next[0] - prev[0])];
        for (let s = 0; s <= ROUND_SEGMENTS; s++) {
            const a = (s / ROUND_SEGMENTS) * 2 * Math.PI;
            geometry.position.push(r * Math.cos(a), y, r * Math.sin(a));
            const n = [slope[0] * Math.cos(a), slope[1], slope[0] * Math.sin(a)];
            geometry.normal.push(...(n.some((c) => { return c !== 0; }) ? unit(n) : [0, 1, 0]));
            geometry.uv.push(s / ROUND_SEGMENTS, row / (profile.length - 1));
        }
    });
    const ring = ROUND_SEGMENTS + 1;
    for (let row = 0; row < profile.length - 1; row++) {
        for (let s = 0; s < ROUND_SEGMENTS; s++) {
            const [a, b, c, d] = [row * ring + s, row * ring + s + 1, (row + 1) * ring + s + 1, (row + 1) * ring + s];
            geometry.index.push(a, c, b, a, d, c);
        }
    }
    return geometry;
}

const sphere = (r) => {
    return lathe(Array.from({ length: ROUND_SEGMENTS / 2 + 1 }, (_, i) => {
        const a = -Math.PI / 2 + (i / (ROUND_SEGMENTS / 2)) * Math.PI;
        return [r * Math.cos(a), r * Math.sin(a)];
    }));
};

/** Turns plain geometry so its +z faces `normal` (static parts keep no node rotation). */
function orient(geometry, normal) {
    const [x, y, z] = frame(normal);
    const turn = (v) => { return [0, 1, 2].map((i) => { return x[i] * v[0] + y[i] * v[1] + z[i] * v[2]; }); };
    const each = (array) => {
        return Array.from({ length: array.length / 3 }, (_, i) => { return turn(array.slice(i * 3, i * 3 + 3)); }).flat();
    };
    return { ...geometry, position: each(geometry.position), normal: each(geometry.normal) };
}

/** Moves plain geometry by `offset`. */
function shift(geometry, offset) {
    return { ...geometry, position: geometry.position.map((v, i) => { return v + offset[i % 3]; }) };
}

const staticName = (label) => { return `static_${car.fullName} • ${label}`; };

function placed(name, geometry, material, at, normal = null) {
    const node = meshNode(name, geometry, material).setTranslation(at);
    if (normal) node.setRotation(quaternion(frame(normal)));
    return node;
}

/** The runtime's moving and live parts, built where `config` says they sit in this cabin. */
function addRig() {
    const materials = Object.fromEntries(Object.entries(RIG_MATERIALS).map(([name, m]) => {
        return [name, doc.createMaterial(`rig • ${name}`).setBaseColorFactor(m.color).setRoughnessFactor(m.roughness).setMetallicFactor(m.metallic)];
    }));
    const modelMaterial = (name) => {
        return doc.getRoot().listMaterials().find((m) => { return m.getName() === name; }) ?? materials[name];
    };
    const root = scene();
    root.addChild(doc.createNode('driver_eye').setTranslation([...config.eye, 0]));

    const cluster = clusterBounds(CLUSTERS[car.cockpit.cluster]);
    const instrument = config.instrument;
    if (instrument.backing) {
        // A blank panel over the model's own painted dials, between them and the live ones.
        root.addChild(placed(staticName('instrument backing'), orient(quad(...instrument.backing), instrument.normal), materials.black,
            add(instrument.centre, scale(unit(instrument.normal), SURFACE_OFFSET / 2))));
    }
    root.addChild(placed('instrument_surface', quad(instrument.width, instrument.width * cluster.h / cluster.w), materials.display,
        add(instrument.centre, scale(unit(instrument.normal), SURFACE_OFFSET)), instrument.normal));
    const display = CABIN.radio.display;
    const trip = config.trip;
    root.addChild(placed('trip_surface', quad(trip.width, trip.width * display.h / display.w), materials.display,
        add(trip.centre, scale(unit(trip.normal), SURFACE_OFFSET)), trip.normal));

    const m = CABIN.mirror;
    const { centre: mirror, normal: facing, width = m.w, housing: housed = true } = config.mirror;
    root.addChild(placed('mirror_surface', quad(width, (width * m.h) / m.w), materials.display, mirror, facing));
    root.addChild(doc.createNode('mirror_camera').setTranslation(mirror).setRotation([0, 1, 0, 0]));
    if (housed) {
        const housing = [m.w + 2 * m.bezel, m.h + 2 * m.bezel, MIRROR.housingDepth];
        root.addChild(placed(staticName('mirror housing'), box(housing), materials.black, add(mirror, [0, 0, -housing[2] / 2 - 0.001])));
        root.addChild(placed(staticName('mirror stem'), box(MIRROR.stem), materials.black,
            add(mirror, [0, housing[1] / 2 + MIRROR.stem[1] / 2, -housing[2] / 2])));
    }

    const r = CABIN.radar;
    const radar = doc.createNode('radar_mount').setTranslation(config.radar.centre);
    for (let i = 0; i < r.leds; i++) {
        const x = (i - (r.leds - 1) / 2) * r.ledGap + r.ledX;
        radar.addChild(placed(`radar_led_${i}`, box(LED_SIZE), materials.display, [x, r.ledY, r.d / 2 + LED_SIZE[2] / 2]));
    }
    root.addChild(radar);
    root.addChild(placed(staticName('radar body'), box([r.w, r.h, r.d]), materials.black, config.radar.centre));

    const lever = config.lever;
    if (!lever.parts) {
        const pivot = doc.createNode('gear_lever').setTranslation(lever.base);
        pivot.addChild(meshNode('gear stick', lathe([[LEVER.stickRadius, 0], [LEVER.stickRadius, lever.length]]), materials[lever.stick]));
        pivot.addChild(meshNode('gear knob', shift(sphere(CABIN.shifter.knob), [0, lever.length, 0]), materials.black));
        root.addChild(pivot);
    }
    if (lever.gate) root.addChild(placed(staticName('gear gate'), box(LEVER.gate), materials[lever.gate], lever.base));
    if (lever.boot) {
        const b = LEVER.boot;
        root.addChild(placed(staticName('gear boot'), lathe([[b.radius, 0], [b.radius * 0.6, b.height * 0.5], [LEVER.stickRadius * 2, b.height]]),
            materials.black, lever.base));
    }
    if (config.console) {
        const { min, max, material } = config.console;
        root.addChild(placed(staticName('console'), box(sub(max, min)), modelMaterial(material), scale(add(min, max), 0.5)));
    }
}

/** Downscales the embedded textures: { baseColor: size, other: size } in pixels. JPEG, except normal
 *  maps and images whose alpha is used (window regions of an atlas), which stay PNG. */
async function shrinkTextures(sizes) {
    const normals = new Set(doc.getRoot().listMaterials().map((m) => { return m.getNormalTexture(); }).filter(Boolean));
    const colors = new Set(doc.getRoot().listMaterials().map((m) => { return m.getBaseColorTexture(); }).filter(Boolean));
    for (const texture of doc.getRoot().listTextures()) {
        const size = colors.has(texture) ? sizes.baseColor : sizes.other;
        const source = sharp(texture.getImage());
        const { isOpaque } = await source.stats();
        const image = source.resize(size, size, { fit: 'inside' });
        const png = normals.has(texture) || !isOpaque;
        texture.setImage(new Uint8Array(await (png ? image.png() : image.jpeg({ quality: 88 })).toBuffer()));
        texture.setMimeType(png ? 'image/png' : 'image/jpeg');
    }
}

// three.js no longer reads specular-glossiness materials; older exports still use them.
await doc.transform(metalRough());
removeParts(config.remove ?? []);
if (config.translucent) splitTranslucent(config.translucent);
fixMaterials(config.materials ?? {});
align();
bake();
await doc.transform(prune());
if (flag === '--aligned') {
    await io.write(alignedPath, doc);
    process.exit(0);
}
const eye = [...config.eye, 0];
extractWindshield(config.windshield);
mountSteeringWheel(config.steeringWheel, eye);
if (config.lever.parts) mountLever(config.lever);
// Flat-shaded sources weld by position alone so the decimator can work; their normals are rebuilt after.
const crease = config.normals?.creaseDeg;
keepAttributes(crease ? ['POSITION'] : ['POSITION', 'NORMAL', 'TEXCOORD_0']);
if (!crease) ensureUVs();
await doc.transform(weld());
await decimateTo(TRIANGLE_TARGET - GENERATED_TRIANGLES);
if (crease) for (const prim of allPrimitives()) creaseNormals(prim, crease);
ensureUVs();
mapWindshield(named(['windshield_surface'])[0]);
batchStatic();
addRig();
if (config.textures) await shrinkTextures(config.textures);
// Keeps the empty eye/mirror-camera markers and the UVs the runtime draws on; the radar LEDs need
// their own meshes for their runtime materials, so only data is shared.
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }));
const out = `${folder}/cabin.glb`;
await io.write(out, doc);
const bounds = getBounds(scene());
console.info(`${out}: ${countTriangles()} triangles; ${bounds.min.map((v) => { return v.toFixed(3); })} .. ${bounds.max.map((v) => { return v.toFixed(3); })}`);
