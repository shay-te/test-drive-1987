import { DEG, clamp } from '../../util/math.js';
import { CABIN } from './cabinLayout.js';

const LED_BLINK_HZ = 6;

export function wheelAngle(steer) {
    return -clamp(steer, -1, 1) * CABIN.wheel.maxTurnDeg * DEG;
}

export function leverAngles(knob) {
    const s = CABIN.shifter;
    return { z: -Math.atan2(knob[0] * s.col, s.length), x: Math.atan2(knob[1] * s.row, s.length) };
}

export function radarLights(signal, time, count) {
    const lit = Math.ceil(clamp(signal, 0, 1) * count);
    const blinkOff = signal > 0.85 && Math.floor(time * LED_BLINK_HZ) % 2 === 1;
    return Array.from({ length: count }, (_, i) => {
        return i < lit && !blinkOff;
    });
}
