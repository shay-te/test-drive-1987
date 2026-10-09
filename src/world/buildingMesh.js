import * as THREE from 'three';
import { BUILDING_COLORS } from '../data/scenery.js';
import { createRng } from '../util/math.js';

/** A pitched roof over this many corners or fewer, if the footprint is convex, rises to a point. */
const PYRAMID_CORNERS = 12;

/** The route's real buildings (buildingLayout.js) as one mesh: walls, a gable roof on four-cornered
 *  houses and a pyramid roof on other convex ones, flat roofs on everything else. */
export function buildBuildings(placed, material) {
    const positions = [];
    const colors = [];
    const triangle = (a, b, c, color) => {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
    };
    /** A triangle turned to face away from `inside`. */
    const facing = (a, b, c, color, inside) => {
        const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const centre = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        if (normal.dot(centre.sub(inside)) < 0) triangle(a, c, b, color);
        else triangle(a, b, c, color);
    };
    for (const building of placed) {
        const rng = createRng(building.index + 1);
        const tint = (list) => {
            const color = new THREE.Color(list[Math.floor(rng() * list.length)]);
            return color.multiplyScalar(1 + (rng() * 2 - 1) * BUILDING_COLORS.variation);
        };
        const wall = tint(BUILDING_COLORS.walls);
        const roof = tint(BUILDING_COLORS.roofs);
        const ring = clockwise(building.ring);
        const order = ring === building.ring ? (i) => { return i; } : (i) => { return ring.length - 1 - i; };
        const top = ring.map((corner, i) => { return new THREE.Vector3(corner.x, building.eaves[order(i)], corner.z); });
        const foot = ring.map((corner) => { return new THREE.Vector3(corner.x, building.base, corner.z); });
        ring.forEach((_, i) => {
            const j = (i + 1) % ring.length;
            triangle(foot[i], foot[j], top[j], wall);
            triangle(foot[i], top[j], top[i], wall);
        });
        const centre = top.reduce((sum, p) => { return sum.add(p); }, new THREE.Vector3()).divideScalar(top.length);
        const below = centre.clone().setY(building.base);
        if (building.roof > 0 && ring.length === 4) {
            // Gable roof: the ridge runs along the longer pair of walls, gable ends close the shorter.
            const long = top[0].distanceTo(top[1]) >= top[1].distanceTo(top[2]) ? 0 : 1;
            const [a, b, c, d] = [0, 1, 2, 3].map((k) => { return top[(k + long) % 4]; });
            const ridgeB = b.clone().add(c).multiplyScalar(0.5).setY(b.y + building.roof);
            const ridgeA = d.clone().add(a).multiplyScalar(0.5).setY(a.y + building.roof);
            for (const [p, q, r, color] of [[a, b, ridgeB, roof], [a, ridgeB, ridgeA, roof], [c, d, ridgeA, roof], [c, ridgeA, ridgeB, roof], [b, c, ridgeB, wall], [d, a, ridgeA, wall]]) {
                facing(p, q, r, color, below);
            }
        } else if (building.roof > 0 && ring.length <= PYRAMID_CORNERS && convex(ring)) {
            const apex = centre.clone().setY(centre.y + building.roof);
            top.forEach((p, i) => { facing(p, top[(i + 1) % top.length], apex, roof, below); });
        } else {
            const contour = top.map((p) => { return new THREE.Vector2(p.x, p.z); });
            for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) facing(top[i], top[j], top[k], roof, below);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Twice the signed area of a ring of { x, z }: positive when it turns from +x towards +z. */
function signedArea(ring) {
    return ring.reduce((sum, a, i) => {
        const b = ring[(i + 1) % ring.length];
        return sum + a.x * b.z - b.x * a.z;
    }, 0);
}

/** `ring` turning from +z towards +x, so each wall's outside lies on its left: reversed if need be. */
function clockwise(ring) {
    return signedArea(ring) > 0 ? [...ring].reverse() : ring;
}

function convex(ring) {
    const turns = ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const c = ring[(i + 2) % ring.length];
        return Math.sign((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x));
    });
    return turns.every((turn) => { return turn >= 0; }) || turns.every((turn) => { return turn <= 0; });
}
