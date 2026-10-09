import { PHYS, ROAD_TEST } from '../config.js';
import { bisect, clamp, lerp, smoothstep } from '../util/math.js';

const RPM_TO_RADS = (2 * Math.PI) / 60;

/** Engine + gearbox: torque curve from published figures, turbo lag, clutch slip and over-rev damage.
 *  Fits drag area (top speed), launch revs and a torque factor (0-60, 0-100, quarter mile) to the road test. */
export class Drivetrain {
    constructor(car) {
        this.car = car;
        this.engine = car.engine;
        this.dt = car.drivetrain;
        this.chassis = car.chassis;
        this.gearCount = this.dt.gears.length;
        this.torqueFactor = 1;
        this.dragArea = 0.7;
        this.launchRpm = this.engine.redline / 2;
        this._buildTorqueCurve();
        this._calibrate();
    }

    // ---------------------------------------------------------------- torque curve

    _buildTorqueCurve() {
        const e = this.engine;
        const peak = e.torque;
        const atPower = (e.hp * PHYS.lbftRpmPerHp) / e.hpRpm;
        // Knots of the full-load curve in (rpm, lb-ft).
        this.knots = [
            [0, peak * 0.45],
            [e.idleRpm, peak * 0.62],
            [e.torqueRpm * 0.6, peak * 0.86],
            [e.torqueRpm, peak],
            [lerp(e.torqueRpm, e.hpRpm, 0.5), lerp(peak, atPower, 0.4)],
            [e.hpRpm, atPower],
            [e.redline, ((atPower * e.hpRpm) / e.redline) * ROAD_TEST.redlinePower],
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
        const launchRpm = s.gear === 1 ? lerp(e.idleRpm, this.launchRpm, s.throttle) : e.idleRpm * 1.05 + s.throttle * 700;
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
        const { topMph, zeroToSixty, zeroToHundred, quarterMile } = this.car.targets;
        const [lo, hi] = ROAD_TEST.torqueFactor;
        for (let pass = 0; pass < ROAD_TEST.passes; pass++) {
            this._solveDragArea(topMph * PHYS.mph);
            this.launchRpm = this._quickestLaunch();
            this.torqueFactor = bisect(lo, hi, (factor) => {
                this.torqueFactor = factor;
                const run = this.roadTest(ROAD_TEST.duration);
                const late =
                    run.timeTo(60 * PHYS.mph) / zeroToSixty +
                    run.timeTo(100 * PHYS.mph) / zeroToHundred +
                    run.quarter.time / quarterMile;
                return late > 3;
            });
        }
        this._solveDragArea(topMph * PHYS.mph);
    }

    /** The launch revs that reach 60 mph soonest, as a road tester finds them. */
    _quickestLaunch() {
        const e = this.engine;
        let best = { rpm: this.launchRpm, time: Infinity };
        for (let rpm = e.idleRpm + ROAD_TEST.launchStep; rpm < e.redline; rpm += ROAD_TEST.launchStep) {
            this.launchRpm = rpm;
            const time = this.roadTest(ROAD_TEST.duration, 60 * PHYS.mph).timeTo(60 * PHYS.mph);
            if (time < best.time) best = { rpm, time };
        }
        return best.rpm;
    }

    _solveDragArea(vTop) {
        const top = this.gearCount;
        const rpm = this.rpmAtSpeed(vTop, top);
        const force = (this.baseTorque(rpm) * this.ratio(top) * this.dt.efficiency) / this.dt.tireRadius;
        const roll = PHYS.rollingResistance * this.chassis.massKg * PHYS.g;
        this.dragArea = Math.max(0.3, (2 * (force - roll)) / (PHYS.airDensity * vTop * vTop));
    }

    /** A magazine road test: full-throttle standing start from the launch revs (boost built against the
     *  clutch), shifting at the redline, timed after the rollout, for `duration` s or until `stopSpeed`. */
    roadTest(duration, stopSpeed = Infinity, dt = 1 / 120) {
        const s = this.createState();
        s.gear = 1;
        s.rpm = this.launchRpm;
        s.boost = this.boostCeiling(this.launchRpm);
        const trace = [];
        const shifts = [];
        const quarter = { time: Infinity, speed: 0 };
        let v = 0;
        let x = 0;
        let accel = 0;
        let clock = 0;
        while (clock < duration && v < stopSpeed && !s.blown) {
            if (s.gear < this.gearCount && s.shiftTimer <= 0 && s.rpm >= this.engine.redline - 60) {
                shifts.push({ from: s.gear, to: s.gear + 1, t: clock, v });
                this.shift(s, 1);
            }
            const force = Math.min(this.update(s, v, 1, dt), this.tractionLimit(accel));
            accel = (force - this.resistance(v)) / this.effectiveMass(s.gear);
            v = Math.max(0, v + accel * dt);
            x += v * dt;
            if (x < ROAD_TEST.rollout) continue;
            clock += dt;
            trace.push([clock, v]);
            if (quarter.time === Infinity && x >= ROAD_TEST.rollout + ROAD_TEST.quarterMile) {
                Object.assign(quarter, { time: clock, speed: v });
            }
        }
        const timeTo = (speed) => {
            const i = trace.findIndex(([, reached]) => {
                return reached >= speed;
            });
            return i < 0 ? Infinity : trace[i][0];
        };
        return { trace, shifts, quarter, timeTo };
    }
}
