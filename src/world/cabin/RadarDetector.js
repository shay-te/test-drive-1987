import * as THREE from 'three';
import { t } from '../../i18n/i18n.js';
import { font } from '../../ui/theme.js';
import { radarLights } from './cabinAnimation.js';
import { CABIN } from './cabinLayout.js';
import { part } from './shapes.js';

const LABEL_TEXELS = 2400;

/** The radar detector clipped to the sun visor: a row of red LEDs that fill up as the signal grows. */
export class RadarDetector {
    constructor(materials) {
        const r = CABIN.radar;
        this.materials = materials;
        this.group = new THREE.Group();
        this.group.add(part(new THREE.BoxGeometry(r.w, r.h, r.d), materials.panel));
        const face = r.d / 2 + 0.0005;
        const power = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 10, 8), materials.power);
        power.position.set(-r.w / 2 + 0.01, r.ledY, face);
        this.group.add(power, this._label(r, face));
        this.leds = Array.from({ length: r.leds }, (_, i) => {
            const led = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), materials.ledOff);
            led.position.set(r.ledX + (i - (r.leds - 1) / 2) * r.ledGap + r.w * 0.12, r.ledY, face);
            this.group.add(led);
            return led;
        });
    }

    /** Lights LEDs for a 0..1 `signal`, blinking when it is strong. */
    update(signal, time) {
        const lights = radarLights(signal, time, this.leds.length);
        this.leds.forEach((led, i) => {
            led.material = lights[i] ? this.materials.ledOn : this.materials.ledOff;
        });
    }

    _label(r, face) {
        const width = r.w * 0.3;
        const height = r.h * 0.4;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * LABEL_TEXELS);
        canvas.height = Math.round(height * LABEL_TEXELS);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#c9cbd0';
        ctx.font = font(canvas.height * 0.8, 'display');
        ctx.textBaseline = 'middle';
        ctx.fillText(t('general.radar'), 0, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
        );
        label.position.set(-r.w / 2 + 0.018 + width / 2, r.ledY + r.h * 0.28, face);
        return label;
    }
}
