import * as THREE from 'three';

const CHUNK = 96;

/** Sweeps a cross-section along the track into chunked meshes. `section(i)` returns the same number
 *  of {u, h} points for every node; the visible side lies to the left of the point order. `displace`
 *  moves each vertex's world point, `color(p, c, i, world)` colours it after. `steps` rows
 *  per node (sections eased between nodes) add detail along the road; `uvAt(world)` lays the texture
 *  by world position instead of along and across the ribbon. */
export function buildRibbon(track, material, section, options = {}) {
    const { from = 0, to = track.count - 1 } = options;
    const group = new THREE.Group();
    for (let start = from; start < to; start += CHUNK) {
        const end = Math.min(to, start + CHUNK);
        group.add(new THREE.Mesh(chunkGeometry(track, start, end, section, options), material));
    }
    return group;
}

function chunkGeometry(track, from, to, section, options) {
    const { alongTile = 10, acrossTile = 10, displace = null, color = null, steps = 1, uvAt = null } = options;
    const rows = (to - from) * steps + 1;
    const sections = new Map();
    const sectionAt = (i) => {
        if (!sections.has(i)) sections.set(i, section(i));
        return sections.get(i);
    };
    const cols = sectionAt(from).length;
    const positions = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const colors = color ? new Float32Array(rows * cols * 3) : null;
    const world = {};
    for (let r = 0; r < rows; r++) {
        const at = from + r / steps;
        const i = Math.floor(at);
        const f = at - i;
        const here = sectionAt(i);
        const next = f > 0 ? sectionAt(i + 1) : here;
        let across = 0;
        let last = null;
        for (let c = 0; c < cols; c++) {
            const p = f > 0 ? { u: here[c].u + (next[c].u - here[c].u) * f, h: here[c].h + (next[c].h - here[c].h) * f } : here[c];
            if (last) across += Math.hypot(p.u - last.u, p.h - last.h);
            last = p;
            track.toWorld(at * track.segment, p.u, p.h, world);
            if (displace) displace(world, p, c, i);
            const k = r * cols + c;
            positions.set([world.x, world.y, world.z], k * 3);
            uvs.set(uvAt ? uvAt(world) : [across / acrossTile, (at * track.segment) / alongTile], k * 2);
            if (colors) colors.set(color(p, c, i, world), k * 3);
        }
    }
    const indices = [];
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            const b = a + cols;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}
