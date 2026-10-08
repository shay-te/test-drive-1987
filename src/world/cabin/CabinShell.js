import * as THREE from 'three';
import { ROAD, VIEW } from '../../config.js';
import { drawCrack } from '../../cockpit/Windshield.js';
import { DEG } from '../../util/math.js';
import { CABIN } from './cabinLayout.js';
import { RadarDetector } from './RadarDetector.js';
import { beam, part, profileSweep, roundedSlab } from './shapes.js';

const DOOR_THICKNESS = 0.07;
/** The crack is painted in screen-like units across the glass (see drawCrack). */
const CRACK_CANVAS = { w: VIEW.width, h: 480 };
const SEAT = { width: 0.5, cushion: 0.5, back: 0.62, thickness: 0.13 };

/** Everything around the driver that does not move on its own: roof, pillars, doors, glass, seats,
 *  floor, visors with the radar detector, the mirror, and the bonnet and wings seen over the dash. */
export class CabinShell {
    constructor(materials, mirrorTexture) {
        this.materials = materials;
        this.group = new THREE.Group();
        this._roof();
        this._pillars();
        this._doors();
        this._glass();
        this._floor();
        for (const x of [ROAD.eyeOffset, CABIN.seat.x]) this._seat(x);
        this._visors();
        this._mirror(mirrorTexture);
        this._bonnet();
    }

    _roof() {
        const w = CABIN.windshield;
        const length = CABIN.rearZ - w.topZ;
        const headliner = part(
            new THREE.BoxGeometry(CABIN.halfWidth * 2, 0.02, length),
            this.materials.headliner,
        );
        headliner.position.set(0, CABIN.roof + 0.01, w.topZ + length / 2);
        const header = beam(
            [-w.topHalf, w.topY + 0.012, w.topZ],
            [w.topHalf, w.topY + 0.012, w.topZ],
            0.05,
            0.05,
            this.materials.headliner,
        );
        this.group.add(headliner, header);
    }

    _pillars() {
        const w = CABIN.windshield;
        const p = CABIN.pillar;
        const m = this.materials;
        for (const side of [-1, 1]) {
            this.group.add(
                beam(
                    [side * w.baseHalf, w.baseY, w.baseZ],
                    [side * w.topHalf, w.topY, w.topZ],
                    p.width,
                    p.depth,
                    m.panel,
                ),
                beam(
                    [side * CABIN.halfWidth, CABIN.belt, CABIN.bPillarZ],
                    [side * (CABIN.halfWidth - 0.06), CABIN.roof, CABIN.bPillarZ + 0.06],
                    0.06,
                    0.14,
                    m.headliner,
                ),
                // Window frame along the roof edge.
                beam(
                    [side * w.topHalf, w.topY, w.topZ],
                    [side * (CABIN.halfWidth - 0.04), CABIN.roof, CABIN.bPillarZ],
                    0.04,
                    0.03,
                    m.panel,
                ),
            );
        }
    }

    /** Door cards with armrest, pull and the black window sill along the belt line. */
    _doors() {
        const m = this.materials;
        const length = CABIN.bPillarZ - CABIN.doorFrontZ;
        const height = CABIN.belt - CABIN.floor;
        for (const side of [-1, 1]) {
            const x = side * (CABIN.halfWidth + DOOR_THICKNESS / 2);
            const card = part(new THREE.BoxGeometry(DOOR_THICKNESS, height, length), m.seat);
            card.position.set(x, CABIN.floor + height / 2, CABIN.doorFrontZ + length / 2);
            const sill = part(new THREE.BoxGeometry(DOOR_THICKNESS + 0.03, 0.03, length), m.panel);
            sill.position.set(x - side * 0.01, CABIN.belt, card.position.z);
            const armrest = part(roundedSlab(0.06, 0.05, length * 0.55, 0.02), m.dashFace);
            armrest.position.set(x - side * 0.055, CABIN.belt - 0.2, card.position.z + 0.05);
            const pull = part(new THREE.BoxGeometry(0.02, 0.02, 0.12), m.chrome);
            pull.position.set(x - side * 0.045, CABIN.belt - 0.08, CABIN.doorFrontZ + 0.22);
            this.group.add(card, sill, armrest, pull);
        }
    }

    /** Windshield and side windows: faint tinted glass that still reflects the sky. */
    _glass() {
        const w = CABIN.windshield;
        const windshield = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-w.baseHalf, w.baseY, w.baseZ),
            new THREE.Vector3(w.baseHalf, w.baseY, w.baseZ),
            new THREE.Vector3(w.topHalf, w.topY, w.topZ),
            new THREE.Vector3(-w.topHalf, w.topY, w.topZ),
        ]);
        windshield.setIndex([0, 1, 2, 0, 2, 3]);
        windshield.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        windshield.computeVertexNormals();
        this.windshield = new THREE.Mesh(windshield, this.materials.glass);
        this.windshield.renderOrder = 1;
        const canvas = document.createElement('canvas');
        canvas.width = CRACK_CANVAS.w;
        canvas.height = CRACK_CANVAS.h;
        this.crackTexture = new THREE.CanvasTexture(canvas);
        this.crackTexture.colorSpace = THREE.SRGBColorSpace;
        this.crack = new THREE.Mesh(
            windshield,
            new THREE.MeshBasicMaterial({ map: this.crackTexture, transparent: true, depthWrite: false }),
        );
        this.crack.renderOrder = 2;
        this.crack.visible = false;
        this.crackSeed = null;
        this.group.add(this.windshield, this.crack);
        // Side windows run from the A-pillar back to the B-pillar, above the belt line.
        const outline = new THREE.Shape([
            new THREE.Vector2(w.baseZ, CABIN.belt),
            new THREE.Vector2(CABIN.bPillarZ, CABIN.belt),
            new THREE.Vector2(CABIN.bPillarZ, CABIN.roof),
            new THREE.Vector2(w.topZ, w.topY),
        ]);
        for (const side of [-1, 1]) {
            const pane = new THREE.Mesh(new THREE.ShapeGeometry(outline), this.materials.glass);
            pane.rotation.y = -Math.PI / 2;
            pane.position.x = side * (CABIN.halfWidth + 0.02);
            pane.renderOrder = 1;
            this.group.add(pane);
        }
    }

    /** Shatters the windshield from `crack` = {x, y, seed} (layout px), or clears it with null. */
    setCrack(crack) {
        this.crack.visible = crack !== null;
        if (!crack || crack.seed === this.crackSeed) return;
        this.crackSeed = crack.seed;
        const canvas = this.crackTexture.image;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawCrack(ctx, crack);
        this.crackTexture.needsUpdate = true;
    }

    _floor() {
        const m = this.materials;
        const length = CABIN.rearZ - CABIN.windshield.baseZ;
        const floor = part(new THREE.BoxGeometry(CABIN.halfWidth * 2, 0.02, length), m.carpet);
        floor.position.set(0, CABIN.floor, CABIN.windshield.baseZ + length / 2);
        const t = CABIN.tunnel;
        const tunnel = part(new THREE.BoxGeometry(t.w, t.h, t.back - t.front), m.carpet);
        tunnel.position.set(CABIN.console.x, CABIN.floor + t.h / 2, (t.front + t.back) / 2);
        // The 911's little rear seats and the parcel shelf behind them.
        const rear = part(new THREE.BoxGeometry(CABIN.halfWidth * 2, 0.45, 0.5), m.carpet);
        rear.position.set(0, CABIN.floor + 0.225, CABIN.rearZ - 0.25);
        this.group.add(floor, tunnel, rear);
    }

    _seat(x) {
        const s = CABIN.seat;
        const m = this.materials;
        const cushion = part(roundedSlab(SEAT.width, SEAT.cushion, SEAT.thickness, 0.06), m.seat);
        cushion.rotation.x = -Math.PI / 2 + 0.12;
        cushion.position.set(x, s.cushionY, s.backZ - SEAT.cushion / 2);
        const back = part(roundedSlab(SEAT.width, SEAT.back, SEAT.thickness, 0.08), m.seat);
        back.rotation.x = -s.backTiltDeg * DEG;
        back.position.set(x, s.cushionY + SEAT.back / 2, s.backZ + 0.06);
        this.group.add(cushion, back);
    }

    /** Both sun visors folded up; the radar detector is clipped under the driver's. */
    _visors() {
        const v = CABIN.visor;
        for (const x of [v.x, -v.x]) {
            const visor = part(roundedSlab(v.w, v.d, 0.018, 0.03), this.materials.headliner);
            visor.rotation.x = -Math.PI / 2 - 0.12;
            visor.position.set(x, v.y, v.z);
            this.group.add(visor);
        }
        this.radar = new RadarDetector(this.materials);
        const eye = new THREE.Vector3(ROAD.eyeOffset, ROAD.eyeHeight, 0);
        this.radar.group.position.set(CABIN.radar.x, v.y - CABIN.radar.h / 2 - 0.012, v.z + 0.01);
        this.radar.group.lookAt(eye);
        this.group.add(this.radar.group);
    }

    /** Rear-view mirror glued to the windshield; its glass shows the rear camera's picture. */
    _mirror(texture) {
        const r = CABIN.mirror;
        const mirror = new THREE.Group();
        mirror.position.set(r.x, r.y, r.z);
        const housing = part(
            roundedSlab(r.w + 2 * r.bezel, r.h + 2 * r.bezel, 0.032, 0.03),
            this.materials.panel,
        );
        housing.position.z = -0.016;
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(r.w, r.h),
            new THREE.MeshBasicMaterial({ map: texture }),
        );
        glass.position.z = 0.0005;
        mirror.add(housing, glass);
        // Aimed between the driver's eye and straight back, as a driver sets it.
        const toEye = new THREE.Vector3(ROAD.eyeOffset, ROAD.eyeHeight, 0).sub(mirror.position).normalize();
        mirror.lookAt(toEye.add(new THREE.Vector3(0, 0, 1)).add(mirror.position));
        const stem = beam(
            [r.x, r.y + r.h / 2, r.z - 0.02],
            [r.x, r.y + r.h / 2 + 0.05, r.z - 0.05],
            0.018,
            0.012,
            this.materials.panel,
        );
        this.group.add(mirror, stem);
    }

    /** The front lid and the two wing tops, the 911's view over the dash, plus the parked wipers. */
    _bonnet() {
        const b = CABIN.bonnet;
        const m = this.materials;
        this.group.add(part(profileSweep(b.profile, b.x0, b.x1, 0.06), m.paint));
        const f = CABIN.fenders;
        for (const side of [-1, 1]) {
            const wing = part(new THREE.SphereGeometry(1, 32, 16), m.paint);
            wing.scale.set(f.width, f.height, f.length);
            wing.position.set(side * f.x, f.y, f.z);
            this.group.add(wing);
        }
        for (const { pivot, tip } of CABIN.wipers) this.group.add(beam(pivot, tip, 0.008, 0.01, m.rubber));
    }
}
