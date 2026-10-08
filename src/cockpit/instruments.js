import { GAME } from '../config.js';
import { clamp, lerp } from '../util/math.js';

/** How hard the engine is revving: 'over' past the redline (it is wearing towards blowing up), 'high'
 *  within the shift hint of it, otherwise 'normal'. */
export function revState(telemetry, car) {
    if (telemetry.rpm > car.engine.redline || telemetry.overRev > 0) return 'over';
    if (telemetry.rpm > car.engine.redline - GAME.shiftHintRpm) return 'high';
    return 'normal';
}

/** Turbo boost in psi for a turbocharged car, or null. */
export function boostPsi(telemetry, car) {
    const turbo = car.engine.turbo;
    return turbo ? telemetry.boost * turbo.peakPsi : null;
}

/** Dipstick level the 930's oil gauge shows with the engine running (0..1). */
const OIL_LEVEL = 0.72;

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
        oilLevel: running ? OIL_LEVEL : 0,
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
