import * as THREE from 'three';
import { t } from '../../i18n/i18n.js';
import { COLORS, font } from '../../ui/theme.js';

/** Plate pictures are painted this many pixels a metre. */
const PIXELS_PER_METRE = 1800;
/** A plate stands this far proud of the panel it is screwed to (m). */
const STANDOFF = 0.004;
/** Shares of the plate's height: the province's line, the serial, the slogan's line; the flag's width
 *  (share of the plate's height) between the serial's halves; the border. */
const LAYOUT = { province: 0.17, serial: 0.56, slogan: 0.14, flag: 0.62, border: 0.03 };
const UP = new THREE.Vector3(0, 1, 0);

/** The car's licence plates as British Columbia issued them from 1985: blue on reflective white,
 *  the province above, the slogan below, the provincial flag between the serial's halves, which here
 *  read the game's name. One per `car.body.plates` mount ({ at, facing, size } in car space, m). */
export function licencePlates(car, resources) {
    const group = new THREE.Group();
    for (const { at, facing, size } of car.body.plates) {
        const [width, height] = size.map((m) => { return Math.round(m * PIXELS_PER_METRE); });
        const canvas = resources.canvas(`licence-plate:${width}x${height}`, width, height, paintPlate);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({ map, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
        // Facing out of the panel with its top up: across is up x out, so it reads left to right.
        const out = new THREE.Vector3(...facing).normalize();
        const across = new THREE.Vector3().crossVectors(UP, out).normalize();
        plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, new THREE.Vector3().crossVectors(out, across), out));
        plate.position.set(...at).addScaledVector(out, STANDOFF);
        group.add(plate);
    }
    return group;
}

/** Frees the plates' pictures, materials and shapes. */
export function disposePlates(group) {
    for (const plate of group.children) {
        plate.material.map.dispose();
        plate.material.dispose();
        plate.geometry.dispose();
    }
}

function paintPlate(ctx, w, h) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    const border = h * LAYOUT.border;
    ctx.strokeStyle = COLORS.navyLight;
    ctx.lineWidth = border;
    ctx.strokeRect(border, border, w - 2 * border, h - 2 * border);
    ctx.fillStyle = COLORS.navyLight;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const line = (text, share, y, family) => {
        ctx.font = font(h * share, family, 'bold');
        const fit = Math.min(1, (w * 0.9) / ctx.measureText(text).width);
        ctx.save();
        ctx.translate(w / 2, y);
        ctx.scale(fit, 1);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    };
    line(t('plate.province'), LAYOUT.province, h * 0.16, 'ui');
    line(t('general.beautiful'), LAYOUT.slogan, h * 0.86, 'ui');
    // The serial's halves either side of the flag.
    const [left, right] = t('title.logo').split(' ');
    const flag = h * LAYOUT.flag;
    ctx.font = font(h * LAYOUT.serial, 'display');
    const half = (w - flag) / 2;
    for (const [text, centre] of [[left, half / 2], [right, w - half / 2]]) {
        const fit = Math.min(1, (half * 0.92) / ctx.measureText(text).width);
        ctx.save();
        ctx.translate(centre, h * 0.52);
        ctx.scale(fit, 1);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }
    paintFlag(ctx, w / 2 - flag / 2, h * 0.3, flag, flag * 0.6);
}

/** British Columbia's flag, as the plate screens it: the Union above, the sun setting over the sea's
 *  waves below. */
function paintFlag(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = COLORS.navyLight;
    ctx.fillRect(x, y, w, h / 3);
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = h * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h / 3);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h / 3);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h / 3);
    ctx.stroke();
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = h * 0.04;
    ctx.stroke();
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.62, h * 0.25, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = COLORS.navyLight;
    ctx.lineWidth = h * 0.06;
    for (let k = 0; k < 3; k++) {
        const wy = y + h * (0.7 + k * 0.11);
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) ctx.lineTo(x + (i / 8) * w, wy + (i % 2 ? -1 : 1) * h * 0.025);
        ctx.stroke();
    }
    ctx.restore();
}
