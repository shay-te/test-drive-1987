import { PHYS } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const RPM_TO_RADS = (2 * Math.PI) / 60;

/** Engine + gearbox: torque curve from published figures, turbo lag, clutch slip and over-rev damage.
 *  Self-calibrates drag area (top speed) and a torque factor (0-60 time) against the brochure. */
export class Drivetrain {
    constructor(car) {
        this.car = car;
        this.engine = car.engine;
        this.dt = car.drivetrain;
        this.chassis = car.chassis;
        this.gearCount = this.dt.gears.length;
        this.torqueFactor = 1;
        this.dragArea = 0.7;
        this._buildTorqueCurve();
        this._calibrate();
    }

    // ---------------------------------------------------------------- torque curve

    _buildTorqueCurve() {
        const e = this.engine;
        const peak = e.torque;
        const atPower = (e.hp * 5252) / e.hpRpm;
        // Knots of the full-load curve in (rpm, lb-ft).
        this.knots = [
            [0, peak * 0.45],
            [e.idleRpm, peak * 0.62],
            [e.torqueRpm * 0.6, peak * 0.86],
            [e.torqueRpm, peak],
            [lerp(e.torqueRpm, e.hpRpm, 0.5), lerp(peak, atPower, 0.4)],
            [e.hpRpm, atPower],
            [e.redline, atPower * 0.86],
            [e.maxRpm, atPower * 0.42],
            [e.maxRpm + 1500, 0],
        ];
    }

    /** Full-load torque in N*m at `rpm` (no boost or throttle applied). */
    baseTorque(rpm) {
        const k = this.knots;
        if (rpm <= k[0][0]) return k[0][1] * PHYS.lbftToNm;
        for (let i = 1; i < k.length; i++) {
            if (rpm <= k[i][0]) {
                const t = (rpm - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
                const s = t * t * (3 - 2 * t);
                return lerp(k[i - 1][1], k[i][1], s) * PHYS.lbftToNm * this.torqueFactor;
            }
        }
        return 0;
    }

    /** Steady-state boost available at `rpm` for a turbo engine (0..1). */
    boostCeiling(rpm) {
        const t = this.engine.turbo;
        return t ? smoothstep(t.spoolRpm, t.fullRpm, rpm) : 1;
    }

    /** Torque multiplier for the current boost level. */
    boostFactor(boost) {
        const t = this.engine.turbo;
        return t ? lerp(t.offBoost, 1, boost) : 1;
    }

    /** Overall reduction from crank to wheel for `gear` (1-based). */
    ratio(gear) {
        return gear > 0 ? this.dt.gears[gear - 1] * this.dt.finalDrive : 0;
    }

    /** Engine rpm corresponding to road speed `v` in `gear`. */
    rpmAtSpeed(v, gear) {
        return ((v / this.dt.tireRadius) * this.ratio(gear)) / RPM_TO_RADS;
    }

    /** Road speed (m/s) at `rpm` in `gear`. */
    speedAtRpm(rpm, gear) {
        const r = this.ratio(gear);
        return r ? (rpm * RPM_TO_RADS * this.dt.tireRadius) / r : 0;
    }

    // ---------------------------------------------------------------- state

    createState() {
        return {
            gear: 0,
            rpm: this.engine.idleRpm,
            boost: 0,
            throttle: 0,
            shiftTimer: 0,
            clutchSlip: 0,
            overRevTime: 0,
            blown: false,
            wheelspin: 0,
            lastShiftAt: 0,
        };
    }

    shift(state, direction) {
        const next = clamp(state.gear + direction, 0, this.gearCount);
        if (next === state.gear || state.blown) return false;
        state.gear = next;
        state.shiftTimer = 0.16;
        return true;
    }

    /** Advances the engine; returns the force at the driven wheels (N). `v` is road speed (m/s). */
    update(s, v, throttle, dt) {
        const e = this.engine;
        s.throttle = s.blown ? 0 : throttle;

        // Turbo spool: boost lags behind the boost the exhaust flow could support.
        if (e.turbo) {
            const target = s.throttle * this.boostCeiling(s.rpm);
            const rate = target > s.boost ? 1 / e.turbo.lagSec : 3.5;
            s.boost += (target - s.boost) * (1 - Math.exp(-rate * dt));
        } else {
            s.boost = s.throttle;
        }

        if (s.shiftTimer > 0) s.shiftTimer -= dt;
        const clutchIn = s.gear === 0 || s.shiftTimer > 0;

        if (clutchIn || s.blown) {
            let target;
            let rate;
            if (s.blown) {
                target = 0;
                rate = 1.5;
            } else if (s.gear > 0) {
                // Mid-shift: the revs swing towards the speed of the newly selected gear.
                target = Math.max(e.idleRpm, this.rpmAtSpeed(v, s.gear));
                rate = 14;
            } else {
                // Neutral: free-revving engine.
                target = e.idleRpm + s.throttle * (e.redline + 80 - e.idleRpm);
                rate = target > s.rpm ? 5.5 : 2.2;
            }
            s.rpm += (target - s.rpm) * (1 - Math.exp(-rate * dt));
            s.clutchSlip = 0;
            s.wheelspin = 0;
            this._trackOverRev(s, dt);
            return 0;
        }

        const ratio = this.ratio(s.gear);
        const wheelRpm = this.rpmAtSpeed(v, s.gear);
        // Clutch slip keeps the engine alive at low road speed (launches, crawling in high gears).
        const launchRpm = s.gear === 1 ? e.idleRpm + s.throttle * 3300 : e.idleRpm * 1.05 + s.throttle * 700;
        if (wheelRpm < launchRpm) {
            s.clutchSlip = clamp(1 - wheelRpm / launchRpm, 0, 1);
            s.rpm += (launchRpm - s.rpm) * (1 - Math.exp(-8 * dt));
        } else {
            s.clutchSlip = 0;
            s.rpm = wheelRpm;
        }

        const lugging = s.gear > 2 && s.clutchSlip > 0 ? 0.55 : 1;
        const driveTorque = this.baseTorque(s.rpm) * this.boostFactor(s.boost) * s.throttle * lugging;
        // Pumping and friction losses give engine braking off-throttle.
        const friction = (18 + 0.011 * s.rpm) * (1 - s.throttle);
        const wheelTorque = (driveTorque - friction) * ratio * this.dt.efficiency;
        this._trackOverRev(s, dt);
        return wheelTorque / this.dt.tireRadius;
    }

    _trackOverRev(s, dt) {
        const e = this.engine;
        if (s.blown) return;
        if (s.rpm > e.maxRpm + 250) {
            s.blown = true; // money shift
        } else if (s.rpm > e.redline + 120) {
            s.overRevTime += dt * (1 + (s.rpm - e.redline) / 600);
            if (s.overRevTime > 3.2) s.blown = true;
        } else {
            s.overRevTime = Math.max(0, s.overRevTime - dt * 0.5);
        }
    }

    /** Tractive force limit of the driven axle (N). */
    tractionLimit(longAccel = 0) {
        const c = this.chassis;
        const rearShare = 1 - c.frontWeight;
        // Weight transfers to the rear under acceleration.
        const transfer = (c.cgHeight / c.wheelbase) * (longAccel / PHYS.g);
        const share = c.driven === 'rear' ? rearShare + transfer : c.frontWeight - transfer;
        // Longitudinal grip of the tyre exceeds the skid-pad (lateral) figure.
        return c.grip * 1.25 * c.massKg * PHYS.g * clamp(share, 0.2, 0.85);
    }

    /** Aerodynamic + rolling resistance (N) at speed `v`. */
    resistance(v) {
        const roll = v > 0.05 ? PHYS.rollingResistance * this.chassis.massKg * PHYS.g : 0;
        return 0.5 * PHYS.airDensity * this.dragArea * v * v + roll;
    }

    /** Effective mass including rotating inertia of the driveline in `gear`. */
    effectiveMass(gear) {
        const r = this.ratio(gear);
        return this.chassis.massKg * (1.03 + 0.001 * r * r);
    }

    // ---------------------------------------------------------------- calibration

    _calibrate() {
        const { topMph, zeroToSixty } = this.car.targets;
        for (let pass = 0; pass < 2; pass++) {
            this._solveDragArea(topMph * PHYS.mph);
            let lo = 0.75;
            let hi = 1.35;
            for (let i = 0; i < 18; i++) {
                this.torqueFactor = (lo + hi) / 2;
                const t = this.simulateLaunch(60 * PHYS.mph).time;
                if (t > zeroToSixty) lo = this.torqueFactor;
                else hi = this.torqueFactor;
            }
        }
        this._solveDragArea(topMph * PHYS.mph);
    }

    _solveDragArea(vTop) {
        const top = this.gearCount;
        const rpm = this.rpmAtSpeed(vTop, top);
        const force = (this.baseTorque(rpm) * this.ratio(top) * this.dt.efficiency) / this.dt.tireRadius;
        const roll = PHYS.rollingResistance * this.chassis.massKg * PHYS.g;
        this.dragArea = Math.max(0.3, (2 * (force - roll)) / (PHYS.airDensity * vTop * vTop));
    }

    /** Full-throttle standing start shifting at the redline: time to `targetSpeed`, speed trace and
     *  shift markers (used for calibration and the brochure graph). */
    simulateLaunch(targetSpeed, maxTime = 60, dt = 1 / 120) {
        const s = this.createState();
        s.gear = 1;
        let v = 0;
        let t = 0;
        let accel = 0;
        const trace = [];
        const shifts = [];
        let sampleClock = 0;
        while (v < targetSpeed && t < maxTime) {
            if (s.gear < this.gearCount && s.shiftTimer <= 0 && s.rpm >= this.engine.redline - 60) {
                shifts.push({ from: s.gear, to: s.gear + 1, t, v });
                this.shift(s, 1);
            }
            let force = this.update(s, v, 1, dt);
            const limit = this.tractionLimit(accel);
            if (force > limit) force = limit;
            accel = (force - this.resistance(v)) / this.effectiveMass(s.gear);
            v = Math.max(0, v + accel * dt);
            t += dt;
            sampleClock += dt;
            if (sampleClock >= 0.1) {
                sampleClock = 0;
                trace.push([t, v]);
            }
            if (s.blown) break;
        }
        return { time: t, trace, shifts };
    }
}
