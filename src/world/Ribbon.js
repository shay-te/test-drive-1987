import * as THREE from 'three';

const CHUNK = 96;

/** Sweeps a cross-section along the track into chunked meshes. `section(i)` returns the same number
 *  of {u, h} points for every node; the visible side lies to the left of the point order. */
export function buildRibbon(track, material, section, options = {}) {
    const {
        from = 0,
        to = track.count - 1,
        alongTile = 10,
        acrossTile = 10,
        displace = null,
        color = null,
    } = options;
    const group = new THREE.Group();
    for (let start = from; start < to; start += CHUNK) {
        const end = Math.min(to, start + CHUNK);
        group.add(
            new THREE.Mesh(
                chunkGeometry(track, start, end, section, alongTile, acrossTile, displace, color),
                material,
            ),
        );
    }
    return group;
}

function chunkGeometry(track, from, to, section, alongTile, acrossTile, displace, color) {
    const rows = to - from + 1;
    const cols = section(from).length;
    const positions = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const colors = color ? new Float32Array(rows * cols * 3) : null;
    const world = {};
    for (let r = 0; r < rows; r++) {
        const i = from + r;
        const points = section(i);
        let across = 0;
        for (let c = 0; c < cols; c++) {
            const p = points[c];
            if (c > 0) across += Math.hypot(p.u - points[c - 1].u, p.h - points[c - 1].h);
            track.nodeWorld(i, p.u, p.h, world);
            if (displace) displace(world, p, c, i);
            const k = r * cols + c;
            positions.set([world.x, world.y, world.z], k * 3);
            uvs.set([across / acrossTile, (i * track.segment) / alongTile], k * 2);
            if (colors) colors.set(color(p, c, i), k * 3);
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
