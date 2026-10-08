import * as THREE from 'three';
import { TRAFFIC_TYPES } from '../data/traffic.js';

const BEVEL = {
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 1,
};
const GLASS_INSET = 0.12;
const LIGHT_BAR_FLASH_HZ = 2.6;
const LIGHT_BAR_GLOW = { flash: 6, idle: 0.2 };

/** Builds and caches 3D models of the road users (extruded side profiles, semis, authored models). */
export class VehicleModels {
    constructor(authored) {
        this.authored = authored;
        this.geometries = new Map();
        this.materials = new Map();
        this.glass = new THREE.MeshStandardMaterial({ color: '#10161c', roughness: 0.06, metalness: 0.5 });
        this.rubber = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.92 });
        this.trim = new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.6 });
        this.chrome = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.2, metalness: 1 });
        this.tail = new THREE.MeshStandardMaterial({
            color: '#5a0000',
            emissive: '#ff1a0a',
            emissiveIntensity: 0.6,
        });
        this.head = new THREE.MeshStandardMaterial({
            color: '#d8d4c0',
            emissive: '#fff4d0',
            emissiveIntensity: 0.25,
        });
    }

    /** A new model group for `vehicle`; local -z is its front. */
    create(vehicle) {
        const spec = TRAFFIC_TYPES[vehicle.type];
        const group = spec.model ? this._modelled(vehicle, spec) : spec.semi ? this._semi(vehicle) : this._car(vehicle, spec);
        group.traverse((child) => {
            child.castShadow = true;
        });
        return group;
    }

    /** Flashes the patrol car light bar (red/blue alternating). */
    animate(group, time) {
        const bar = group.userData.lightBar;
        if (!bar) return;
        const phase = Math.floor(time * LIGHT_BAR_FLASH_HZ * 2) % 2;
        bar.red.emissiveIntensity = group.userData.siren && phase === 0 ? LIGHT_BAR_GLOW.flash : LIGHT_BAR_GLOW.idle;
        bar.blue.emissiveIntensity = group.userData.siren && phase === 1 ? LIGHT_BAR_GLOW.flash : LIGHT_BAR_GLOW.idle;
    }

    /** A copy of the authored model; its light bar lenses get materials of their own to flash. */
    _modelled(vehicle, spec) {
        const group = this.authored.instance(spec.model);
        if (spec.lightBar) {
            const lens = (name) => {
                const mesh = group.getObjectByName(name);
                mesh.material = mesh.material.clone();
                return mesh.material;
            };
            group.userData.lightBar = { red: lens(spec.lightBar.red), blue: lens(spec.lightBar.blue) };
            group.userData.siren = Boolean(vehicle.siren);
        }
        return group;
    }

    paint(color) {
        if (!this.materials.has(color)) {
            this.materials.set(
                color,
                new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35 }),
            );
        }
        return this.materials.get(color);
    }

    _cached(key, factory) {
        if (!this.geometries.has(key)) this.geometries.set(key, factory());
        return this.geometries.get(key);
    }

    _car(vehicle, spec) {
        const { body, length, width } = spec;
        const group = new THREE.Group();
        const paint = this.paint(vehicle.color);
        const extrude = (part, minY, maxY, inset) => {
            return this._cached(`${vehicle.type}:${part}`, () => {
                return extrudeProfile(clipProfile(body.profile, minY, maxY), length, width - inset);
            });
        };
        group.add(new THREE.Mesh(extrude('body', 0, body.belt, 0), paint));
        group.add(new THREE.Mesh(extrude('glass', body.belt, body.roof, GLASS_INSET), this.glass));
        group.add(new THREE.Mesh(extrude('roof', body.roof, 9, GLASS_INSET + 0.02), paint));
        for (const wheel of body.wheels) {
            for (const side of [-1, 1])
                group.add(this._wheel(wheel.r, side * (width / 2 - 0.12), wheel.x - length / 2));
        }
        const lampY = body.belt - 0.12;
        for (const side of [-1, 1]) {
            group.add(box(0.36, 0.13, 0.04, this.tail, side * (width / 2 - 0.25), lampY, length / 2 + 0.03));
            group.add(
                box(0.3, 0.14, 0.04, this.head, side * (width / 2 - 0.28), lampY - 0.08, -length / 2 - 0.03),
            );
        }
        group.add(box(width * 0.98, 0.16, 0.12, this.trim, 0, 0.42, length / 2));
        group.add(box(width * 0.98, 0.16, 0.12, this.trim, 0, 0.42, -length / 2));
        return group;
    }

    _semi(vehicle) {
        const group = new THREE.Group();
        const cab = this.paint(vehicle.color);
        const trailer = this.paint('#dedcd4');
        group.add(box(2.4, 1.5, 1.8, cab, 0, 1.45, -6.1));
        group.add(box(2.5, 1.7, 2.3, cab, 0, 2.3, -4.1));
        group.add(box(2.3, 0.9, 0.05, this.glass, 0, 2.7, -5.27));
        group.add(box(1.1, 0.7, 0.1, this.chrome, 0, 1.4, -7.02));
        group.add(box(2.55, 2.8, 11.5, trailer, 0, 2.55, 1.2));
        group.add(box(2.4, 0.3, 11.2, this.trim, 0, 1.0, 1.2));
        for (const side of [-1, 1]) {
            group.add(box(0.3, 0.15, 0.04, this.tail, side * 1.05, 1.3, 7.0));
            group.add(box(0.28, 0.2, 0.04, this.head, side * 0.9, 1.2, -7.03));
            for (const z of [-6.2, -2.9, -1.7, 4.8, 6.0]) group.add(this._wheel(0.5, side * 1.0, z));
        }
        return group;
    }

    _wheel(radius, x, z) {
        const tyre = this._cached(`tyre:${radius}`, () => {
            return new THREE.CylinderGeometry(radius, radius, 0.26, 18).rotateZ(Math.PI / 2);
        });
        const mesh = new THREE.Mesh(tyre, this.rubber);
        mesh.position.set(x, radius, z);
        return mesh;
    }
}

function box(w, h, d, material, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
}

/** Keeps the part of a polygon between two heights (Sutherland-Hodgman against two lines). */
function clipProfile(points, minY, maxY) {
    const clip = (poly, keep, edgeY) => {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            if (keep(a)) out.push(a);
            if (keep(a) !== keep(b)) {
                const f = (edgeY - a[1]) / (b[1] - a[1]);
                out.push([a[0] + (b[0] - a[0]) * f, edgeY]);
            }
        }
        return out;
    };
    const above = clip(
        points,
        (p) => {
            return p[1] >= minY;
        },
        minY,
    );
    return clip(
        above,
        (p) => {
            return p[1] <= maxY;
        },
        maxY,
    );
}

/** Extrudes a side profile across the car's width: front towards -z, centred on the origin. */
function extrudeProfile(points, length, width) {
    const shape = new THREE.Shape(
        points.map(([x, y]) => {
            return new THREE.Vector2(x - length / 2, y);
        }),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, { ...BEVEL, depth: width - 2 * BEVEL.bevelThickness });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(width / 2 - BEVEL.bevelThickness, 0, 0);
    geometry.computeVertexNormals();
    return geometry;
}
