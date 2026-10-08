import * as THREE from 'three';

/** Render layer of the cabin: drawn in its own pass after the world, with its own lights. */
export const CABIN_LAYER = 1;

const UP = new THREE.Vector3(0, 1, 0);

/** A mesh that casts and receives shadows. */
export function part(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Box running from point `a` to point `b` with the given cross-section: pillars, rails, arms. */
export function beam(a, b, width, depth, material) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const mesh = part(new THREE.BoxGeometry(width, from.distanceTo(to), depth), material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, to.sub(from).normalize());
    return mesh;
}

/** Rounded-rectangle outline centred on (cx, cy). */
export function roundedRect(width, height, radius, path = new THREE.Shape(), cx = 0, cy = 0) {
    const x = cx - width / 2;
    const y = cy - height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y);
    path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r);
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    return path;
}

/** A slab with rounded corners and soft edges, centred, `depth` along z. */
export function roundedSlab(width, height, depth, radius, softness = depth * 0.3) {
    const bevel = Math.min(softness, width * 0.45, height * 0.45, depth * 0.45);
    const shape = roundedRect(width - 2 * bevel, height - 2 * bevel, Math.max(radius - bevel, 0.001));
    const core = Math.max(depth - 2 * bevel, 0.0005);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: core,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 10,
    });
    geometry.translate(0, 0, -core / 2);
    return geometry;
}

/** Extrudes a side profile (points [z, y], smoothed through a closed spline) across the car from
 *  x0 to x1; `bevel` rounds both ends alike. */
export function profileSweep(points, x0, x1, bevel = 0) {
    const outline = new THREE.CatmullRomCurve3(
        points.map(([z, y]) => {
            return new THREE.Vector3(z, y, 0);
        }),
        true,
        'centripetal',
    );
    const shape = new THREE.Shape(
        outline.getPoints(points.length * 8).map((p) => {
            return new THREE.Vector2(p.x, p.y);
        }),
    );
    const width = Math.max(x1 - x0 - 2 * bevel, 0.001);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: width,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel * 0.5,
        bevelSegments: 6,
        curveSegments: 16,
    });
    // Profile x is the car's z; the extrusion runs along the car's x.
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(x1 - bevel, 0, 0);
    return geometry;
}

/** Puts every object under `root` on the cabin layer. */
export function onCabinLayer(root) {
    root.traverse((object) => {
        object.layers.set(CABIN_LAYER);
    });
    return root;
}
