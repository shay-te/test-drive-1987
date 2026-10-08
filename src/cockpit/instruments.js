import { clamp, lerp } from '../util/math.js';

/** Converts the car's telemetry into the readings each instrument shows. */
export function instrumentReadings(telemetry, car, { fuel = 1, time = new Date() } = {}) {
    const running = !telemetry.blown;
    const load = telemetry.rpm / car.engine.redline;
    return {
        speed: Math.max(0, telemetry.mph),
        rpm: telemetry.rpm / 1000,
        boost: telemetry.boost,
        oil: running ? clamp(12 + telemetry.rpm / 95, 0, 80) : 0,
        water: lerp(0.48, 0.62, clamp(load, 0, 1)),
        oilTemp: lerp(0.45, 0.66, clamp(load, 0, 1)),
        fuel,
        volts: running ? 13.6 + 0.4 * clamp(load, 0, 1) : 11.8,
        clock: (time.getHours() % 12) + time.getMinutes() / 60,
    };
}

/** Text for an LCD readout of `reading`, by the readout's `format`. */
export function formatReading(format, reading) {
    if (format === 'rpm') return String(Math.round((reading * 1000) / 50) * 50);
    if (format === 'temp') return String(Math.round(100 + reading * 160));
    if (format === 'volts') return reading.toFixed(1);
    return String(Math.round(reading));
}

/** Which warning lamps are lit. */
export function lampStates(telemetry, car, time) {
    const overRev = telemetry.rpm > car.engine.redline + 120;
    return {
        signal: false,
        beam: false,
        warning: telemetry.blown || (overRev && Math.floor(time * 4) % 2 === 0),
        overdrive: car.drivetrain.gearLabels?.[telemetry.gear - 1] === 'OD',
    };
}

/** Maps a value onto a dial's sweep (angles in degrees, 0 = 3 o'clock, clockwise). */
export function dialAngle(dial, value) {
    const f = clamp((value - dial.min) / (dial.max - dial.min), 0, 1);
    return lerp(dial.startDeg, dial.endDeg, f);
}

/** A gauge needle with mass and damping, so it lags and settles like the real thing. */
export class NeedleSpring {
    constructor(stiffness = 140, damping = 18) {
        this.stiffness = stiffness;
        this.damping = damping;
        this.value = 0;
        this.velocity = 0;
    }

    update(target, dt) {
        const accel = (target - this.value) * this.stiffness - this.velocity * this.damping;
        this.velocity += accel * dt;
        this.value += this.velocity * dt;
        return this.value;
    }
}
