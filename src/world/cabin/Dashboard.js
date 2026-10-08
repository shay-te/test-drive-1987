import * as THREE from 'three';
import { CabinDisplays } from './CabinDisplays.js';
import { CLUSTERS, POD_RADIUS } from '../../cockpit/clusters.js';
import { DEG } from '../../util/math.js';
import { CABIN } from './cabinLayout.js';
import { beam, part, profileSweep, roundedRect, roundedSlab } from './shapes.js';

/** Margin of the black pod panel around the instrument face (m). */
const PANEL_MARGIN = 0.03;
const SLAT = 0.011;

/** The dashboard: padded top and hood, instruments behind their pods, fascia, vents, radio, console. */
export class Dashboard {
    constructor(car, materials, resources) {
        const cluster = CLUSTERS[car.cockpit.cluster];
        this.materials = materials;
        this.displays = new CabinDisplays(car, resources);
        this.group = new THREE.Group();
        this._body();
        this._instruments(cluster);
        this._fascia();
        this._vent(CABIN.squareVent, 1);
        this._vent(CABIN.louvre, 2);
        this._radio();
        this._console();
    }

    /** Repaints the live instruments and, when its text changed, the trip computer. */
    update(state, readings, lamps, tripLines) {
        this.displays.update(state, readings, lamps, tripLines);
    }

    _body() {
        const m = this.materials;
        const hood = CABIN.hood;
        // Passenger side runs the full profile; under the hood the dash drops to a shelf below the dials.
        const shelf = [
            [-0.98, 0.86],
            [-0.8, 0.86],
            [-0.74, 0.76],
            [-0.64, 0.745],
            [-0.622, 0.73],
            ...CABIN.dash.slice(5),
        ];
        this.group.add(
            part(profileSweep(CABIN.dash, hood.x1 - hood.bevel, CABIN.halfWidth), m.dashFace),
            part(profileSweep(shelf, -CABIN.halfWidth, hood.x1 - hood.bevel), m.dashFace),
            part(profileSweep(hood.profile, hood.x0, hood.x1, hood.bevel), m.dashTop),
        );
        const knee = part(
            new THREE.CylinderGeometry(CABIN.knee.radius, CABIN.knee.radius, CABIN.halfWidth * 2, 20),
            m.dashFace,
        );
        knee.rotation.z = Math.PI / 2;
        knee.position.set(0, CABIN.knee.y, CABIN.knee.z);
        this.group.add(knee);
    }

    /** The cluster painted on a face under the hood, seen through a black panel with one hole per pod. */
    _instruments(cluster) {
        const f = CABIN.face;
        const b = this.displays.face.bounds;
        const width = b.w * f.scale;
        const height = b.h * f.scale;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const local = (x, y) => {
            return [(x - cx) * f.scale, -(y - cy) * f.scale];
        };

        const frame = new THREE.Group();
        frame.position.set(f.x, f.y, f.z);
        frame.rotation.x = -f.tiltDeg * DEG;
        const dial = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            this.displays.clusterMaterial,
        );
        dial.receiveShadow = true;
        frame.add(dial);

        const panel = roundedRect(width + 2 * PANEL_MARGIN, height + 2 * PANEL_MARGIN, 0.02);
        const h = cluster.housing;
        if (h.style === 'pods') {
            const dials = cluster.instruments.filter((item) => {
                return item.type === 'dial' && !item.sharesFace;
            });
            for (const item of dials) {
                // A small dial set inside a bigger one (the 930's boost gauge) shares its pod.
                const nested = dials.some((o) => {
                    return o.r > item.r && Math.hypot(o.x - item.x, o.y - item.y) < o.r;
                });
                if (nested) continue;
                const [x, y] = local(item.x, item.y);
                const hole = new THREE.Path();
                hole.absarc(x, y, item.r * POD_RADIUS * f.scale, 0, Math.PI * 2, true);
                panel.holes.push(hole);
            }
        } else {
            const [x, y] = local(h.x + h.w / 2, h.y + h.h / 2);
            panel.holes.push(
                roundedRect(h.w * f.scale, h.h * f.scale, h.r * f.scale, new THREE.Path(), x, y),
            );
        }
        const pods = part(
            new THREE.ExtrudeGeometry(panel, { depth: f.inset, bevelEnabled: false, curveSegments: 40 }),
            this.materials.panel,
        );
        frame.add(pods);
        this.group.add(frame);
    }

    /** Black switch strip across the dash under the dials, with the light and wiper switches. */
    _fascia() {
        const c = CABIN.fascia;
        const m = this.materials;
        const strip = part(new THREE.BoxGeometry(c.x1 - c.x0, c.y1 - c.y0, 0.012), m.panel);
        strip.position.set((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, c.z);
        this.group.add(strip);
        for (const [x, y] of CABIN.switches) {
            const knob = part(new THREE.CylinderGeometry(0.011, 0.012, 0.02, 20), m.rubber);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(x, y, c.z + 0.012);
            this.group.add(knob);
        }
    }

    /** Louvred air vent: dark frame, horizontal slats and a divider between `sections`. */
    _vent(v, sections) {
        const m = this.materials;
        const z = CABIN.fascia.z;
        const frame = part(roundedSlab(v.w + 0.012, v.h + 0.012, 0.012, 0.006), m.panel);
        frame.position.set(v.x, v.y, z + 0.002);
        this.group.add(frame);
        for (let y = v.y - v.h / 2 + SLAT; y < v.y + v.h / 2; y += SLAT * 1.4) {
            const slat = part(new THREE.BoxGeometry(v.w - 0.006, SLAT * 0.55, 0.004), m.accent);
            slat.position.set(v.x, y, z + 0.009);
            slat.rotation.x = -0.4;
            this.group.add(slat);
        }
        for (let i = 1; i < sections; i++) {
            const x = v.x - v.w / 2 + (v.w * i) / sections;
            this.group.add(
                beam([x, v.y - v.h / 2, z + 0.01], [x, v.y + v.h / 2, z + 0.01], 0.006, 0.006, m.panel),
            );
        }
    }

    /** Period cassette radio in the fascia; its display shows the trip computer. */
    _radio() {
        const r = CABIN.radio;
        const m = this.materials;
        const z = CABIN.fascia.z + 0.008;
        const body = part(roundedSlab(r.w, r.h, 0.02, 0.004), m.accent);
        body.position.set(r.x, r.y, z);
        this.group.add(body);
        const d = r.display;
        const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(d.w, d.h),
            this.displays.tripMaterial,
        );
        screen.position.set(r.x + d.x, r.y, z + 0.0105);
        this.group.add(screen);
        const keys = r.x + d.x + d.w / 2 + 0.01;
        const keyW = (r.x + r.w / 2 - 0.008 - keys) / 3;
        for (let i = 0; i < 6; i++) {
            const key = part(new THREE.BoxGeometry(keyW * 0.8, 0.011, 0.006), m.panel);
            key.position.set(keys + ((i % 3) + 0.5) * keyW, r.y + (i < 3 ? 0.009 : -0.011), z + 0.011);
            this.group.add(key);
        }
    }

    /** Centre console from the fascia down to the tunnel, with the two heater knobs. */
    _console() {
        const c = CABIN.console;
        const m = this.materials;
        const box = part(new THREE.BoxGeometry(c.w, c.top - c.bottom, c.back - c.front), m.dashFace);
        box.position.set(c.x, (c.top + c.bottom) / 2, (c.front + c.back) / 2);
        this.group.add(box);
        for (const side of [-1, 1]) {
            const knob = part(new THREE.CylinderGeometry(0.016, 0.018, 0.02, 24), m.rubber);
            knob.rotation.x = Math.PI / 2 - 0.5;
            knob.position.set(c.x + side * c.w * 0.3, c.top - 0.08, c.back + 0.01);
            this.group.add(knob);
        }
    }
}
