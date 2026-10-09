import * as THREE from 'three';
import { RAILWAY } from '../data/scenery.js';

/** The railway along `runs` (src/world/railwayLayout.js): its ballast bed, the ties painted on its top,
 *  spreading down to the ground either side (on a bridge, a steel girder under it instead), and the
 *  two rails at standard gauge. `materials` is the stage's WorldMaterials. */
export function buildRailway(runs, materials) {
    const group = new THREE.Group();
    const half = RAILWAY.bed.top / 2;
    const foot = half + RAILWAY.bed.spread;
    const [railWidth, railHeight] = RAILWAY.rail;
    for (const run of runs) {
        const down = (point, side) => { return point.feet[side] - point.y; };
        group.add(sweep(run.points, () => { return [[-half, 0], [half, 0]]; }, materials.trackBed, true));
        const flanks = run.bridge
            ? () => { return [[-half, 0], [-half, -RAILWAY.girder], [half, -RAILWAY.girder], [half, 0]]; }
            : (point) => { return [[foot, down(point, 1)], [half, 0], [-half, 0], [-foot, down(point, 0)]]; };
        group.add(sweep(run.points, flanks, run.bridge ? materials.rust : materials.ballast));
        for (const side of [-1, 1]) {
            const x = side * (RAILWAY.gauge + railWidth) / 2;
            const rail = [[x - railWidth / 2, 0], [x - railWidth / 2, railHeight], [x + railWidth / 2, railHeight], [x + railWidth / 2, 0]];
            group.add(sweep(run.points, () => { return rail; }, materials.rust));
        }
    }
    return group;
}

/** A surface swept along `points` ({ x, y, z }): at each one the cross-section `profile(point)` gives,
 *  as [across, up] (m) from the point square to the line; textured along by the tie spacing when
 *  `tiled` (u across, v along). */
function sweep(points, profile, material, tiled = false) {
    const positions = [];
    const uvs = [];
    const indices = [];
    let along = 0;
    points.forEach((point, k) => {
        const [prev, next] = [points[Math.max(0, k - 1)], points[Math.min(points.length - 1, k + 1)]];
        const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
        const [ax, az] = [-(next.z - prev.z) / length, (next.x - prev.x) / length];
        if (k > 0) along += Math.hypot(point.x - points[k - 1].x, point.z - points[k - 1].z);
        const section = profile(point);
        section.forEach(([across, up], j) => {
            positions.push(point.x + ax * across, point.y + up, point.z + az * across);
            uvs.push(tiled ? j / (section.length - 1) : 0, along / RAILWAY.tieSpacing);
        });
        if (k === 0) return;
        const [a, b] = [(k - 1) * section.length, k * section.length];
        for (let j = 0; j < section.length - 1; j++) indices.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
}
