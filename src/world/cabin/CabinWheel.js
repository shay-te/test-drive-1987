import * as THREE from 'three';
import { t } from '../../i18n/i18n.js';
import { font } from '../../ui/theme.js';
import { DEG } from '../../util/math.js';
import { wheelAngle } from './cabinAnimation.js';
import { CABIN } from './cabinLayout.js';
import { part, roundedSlab } from './shapes.js';

/** Spoke directions (degrees from 3 o'clock, clockwise) by spoke count. */
const SPOKES = { 2: [-8, 188], 3: [-8, 188, 90], 4: [2, 178, 58, 122] };
const EMBLEM_TEXELS = 2400;

/** The steering wheel on its column: leather rim, spokes and hub (or the 911's padded centre). */
export class CabinWheel {
    constructor(car, materials) {
        const w = CABIN.wheel;
        this.style = car.cockpit.wheel;
        this.group = new THREE.Group();
        this.group.position.set(w.x, w.y, w.z);
        this.group.rotation.x = -w.tiltDeg * DEG;
        this.spin = new THREE.Group();
        this.group.add(this.spin);

        this.spin.add(part(new THREE.TorusGeometry(w.radius, w.tube, 18, 120), materials.wheel));
        for (const angle of SPOKES[this.style.spokes])
            this.spin.add(this._spoke(angle * DEG, materials.spoke));
        this.spin.add(...this._hub(car, materials));
        const column = part(new THREE.CylinderGeometry(0.032, 0.04, 0.3, 20), materials.panel);
        column.rotation.x = Math.PI / 2;
        column.position.z = -0.17;
        this.group.add(column);
    }

    /** Turns the wheel for `steer` (-1..1, right positive). */
    update(steer) {
        this.spin.rotation.z = wheelAngle(steer);
    }

    _spoke(angle, material) {
        const w = CABIN.wheel;
        const spoke = part(new THREE.BoxGeometry(w.radius, 0.034, 0.012), material);
        const dir = new THREE.Vector2(Math.cos(angle), -Math.sin(angle));
        spoke.position.set((dir.x * w.radius) / 2, (dir.y * w.radius) / 2, -0.012);
        spoke.rotation.z = Math.atan2(dir.y, dir.x);
        return spoke;
    }

    /** The 911's big padded centre with the make embossed across it, or a round hub with the TD badge. */
    _hub(car, materials) {
        const p = CABIN.pad;
        const pad = this.style.hub === 'pad';
        const hub = pad
            ? part(roundedSlab(p.w, p.h, p.depth, p.radius, 0.014), materials.spoke)
            : part(new THREE.CylinderGeometry(0.05, 0.055, p.depth, 32), materials.spoke);
        if (pad) hub.position.y = p.dy;
        else hub.rotation.x = Math.PI / 2;
        const text = this.style.emblem === 'make' ? car.make : t('title.badge');
        const width = pad ? p.w * 0.8 : 0.07;
        const height = pad ? p.h * 0.36 : 0.07;
        const emblem = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshStandardMaterial({
                map: this._emblem(text, width, height, pad),
                transparent: true,
                roughness: 0.6,
            }),
        );
        emblem.position.set(0, pad ? p.dy + p.h * (0.5 - p.emblemY) : 0, p.depth / 2 + 0.0008);
        return [hub, emblem];
    }

    /** Embossed lettering (pad) or the round "TD" badge, as a transparent texture. */
    _emblem(text, width, height, embossed) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * EMBLEM_TEXELS);
        canvas.height = Math.round(height * EMBLEM_TEXELS);
        const ctx = canvas.getContext('2d');
        const h = canvas.height;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (embossed) {
            ctx.font = font(h * 0.62, 'display');
            ctx.letterSpacing = `${h * 0.22}px`;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillText(text, canvas.width / 2, h / 2 - 1);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillText(text, canvas.width / 2, h / 2 + 1);
        } else {
            ctx.fillStyle = '#c9cdd3';
            ctx.beginPath();
            ctx.arc(h / 2, h / 2, h / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#101012';
            ctx.beginPath();
            ctx.arc(h / 2, h / 2, h * 0.43, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e6e8ec';
            ctx.font = font(h * 0.42, 'display');
            ctx.fillText(text, h / 2, h / 2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
}
