import { GAME, PHYS, RAIL, ROAD } from '../config.js';
import { approach, clamp, moveTowards, wrapAngle } from '../util/math.js';
import { Drivetrain } from './Drivetrain.js';

const HALF_CAR_WIDTH = 0.9;
const SUBSTEP = 1 / 240;
const COUNTER_STEER = 0.8;
/** Full pedal travel per second. */
const PEDAL_RATE = 4;
/** Peak grip of each axle relative to the car's: the front lets go first (stable limit understeer). */
const FRONT_GRIP = 0.9;
const REAR_GRIP = 1.08;
/** Share of rigid-body pitch transfer that reaches the tyres (suspension compliance). */
const TRANSFER_SCALE = 0.55;
const GRAVEL_GRIP = 0.8;
/** Body slip angle of normal cornering, below which the counter-steer assist stays out. */
const SLIDE_DEADZONE = 0.07;
/** Pacejka shape factor: how much grip is left once a tyre slides past its peak. */
const TYRE_SHAPE = 1.2;

/** Longitudinal force an axle can take: `demand`, limited to the grip its lateral force leaves. */
function gripBudget(demand, grip, lateral) {
    const left = Math.sqrt(Math.max(0, grip * grip - lateral * lateral)) * 0.95;
    const limit = Math.max(grip * 0.15, left);
    return clamp(demand, -limit, limit);
}

/** Single-track (bicycle) vehicle model in road coordinates. Pacejka-like tyres share grip through a
 *  friction ellipse, so understeer, oversteer and slides emerge rather than being scripted. */
export class VehicleDynamics {
    constructor(car) {
        this.car = car;
        this.drivetrain = new Drivetrain(car);
        const c = car.chassis;
        this.mass = c.massKg;
        this.a = c.wheelbase * (1 - c.frontWeight); // CG to front axle
        this.b = c.wheelbase * c.frontWeight; // CG to rear axle
        this.inertia = this.mass * this.a * this.b * 1.05;
        this.mu = c.grip * 1.1;
        // Cornering stiffness per radian, normalised by axle load. The rear axle is stiffer
        // (wider tyres), which gives the stable understeer balance of a road car.
        this.stiffFront = 21;
        this.stiffRear = 21 * (car.chassis.rearStiffness ?? 1.3);
        this.reset(0, ROAD.laneWidth / 2);
    }

    reset(s, u) {
        this.s = s;
        this.u = u;
        this.vx = 0;
        this.vy = 0;
        this.yawRate = 0;
        this.theta = 0;
        // Which way along the road the car is going (1 towards the finish, -1 back), and how fast (m/s).
        this.dir = 1;
        this.sDot = 0;
        this.steer = 0;
        this.longAccel = 0;
        this.latAccel = 0;
        this.slip = 0;
        this.fyFront = 0;
        this.fyRear = 0;
        this.throttle = 0;
        this.brake = 0;
        this.surface = 'asphalt';
        this.engine = this.drivetrain.createState();
    }

    get speed() {
        return Math.hypot(this.vx, this.vy);
    }

    /** The speedometer: mph either way. */
    get speedMph() {
        return Math.abs(this.vx) / PHYS.mph;
    }

    /** Speed-sensitive steering lock: a little more than the grip limit needs, so keys stay controllable. */
    maxSteer() {
        const v = Math.max(Math.abs(this.vx), 1);
        return clamp((1.2 * this.mu * PHYS.g * (this.a + this.b)) / (v * v) + 0.032, 0.035, 0.55);
    }

    /** Advances the car; returns a crash event or null. `input.steer` is -1..1, right positive. */
    step(dt, input, track) {
        let event = null;
        let t = dt;
        while (t > 1e-6 && !event) {
            const h = Math.min(SUBSTEP, t);
            event = this._substep(h, input, track);
            t -= h;
        }
        return event;
    }

    _substep(dt, input, track) {
        const dtState = this.engine;
        const v = this.vx;

        // Steering column: rate-limited, self-centring. Like a driver's instinct, the assist steers
        // into a slide (counter-steer) in proportion to the body slip angle.
        const sideslip = v > 3 ? Math.atan2(this.vy, v) : 0;
        const slide = Math.sign(sideslip) * Math.max(0, Math.abs(sideslip) - SLIDE_DEADZONE);
        const target = clamp(input.steer * this.maxSteer() + COUNTER_STEER * slide, -0.55, 0.55);
        const rate = Math.abs(target) > Math.abs(this.steer) ? 1.6 : 3.2;
        this.steer = moveTowards(this.steer, target, rate * this.maxSteer() * dt + 0.25 * dt);

        // Surface.
        const halfRoad = ROAD.halfWidth;
        const onShoulder = this.u > halfRoad + 0.3 || this.u < -halfRoad - 0.3;
        this.surface = onShoulder ? 'gravel' : 'asphalt';
        const mu = this.mu * (onShoulder ? GRAVEL_GRIP : 1);

        // Loads with longitudinal weight transfer.
        const m = this.mass;
        const L = this.a + this.b;
        const staticFront = (m * PHYS.g * this.b) / L;
        const staticRear = (m * PHYS.g * this.a) / L;
        const accel = clamp(this.longAccel, -1.2 * PHYS.g, 1.2 * PHYS.g);
        const transfer = clamp(
            (TRANSFER_SCALE * m * this.car.chassis.cgHeight * accel) / L,
            -staticRear * 0.8,
            staticFront * 0.8,
        );
        const fzFront = staticFront - transfer;
        const fzRear = staticRear + transfer;

        // Pedals travel instead of switching. Brakes are load-proportioned and each axle's
        // drive/brake force is held to the grip left after cornering (ABS / feathered throttle).
        this.throttle = moveTowards(this.throttle, input.throttle, PEDAL_RATE * dt);
        this.brake = moveTowards(this.brake, input.brake, PEDAL_RATE * dt);
        const drive = this.drivetrain.update(dtState, v, this.throttle, dt);
        const brakeTotal = Math.abs(v) > 0.05 ? Math.sign(v) * this.brake * mu * m * PHYS.g : 0;
        const frontShare = fzFront / (fzFront + fzRear);
        const muFront = mu * FRONT_GRIP;
        const muRear = mu * REAR_GRIP;
        const frontLong = gripBudget(-brakeTotal * frontShare, muFront * fzFront, this.fyFront);
        const rearDemand = drive - brakeTotal * (1 - frontShare);
        const rearLong = gripBudget(rearDemand, muRear * fzRear, this.fyRear);
        dtState.wheelspin =
            rearDemand > rearLong ? clamp((rearDemand - rearLong) / (muRear * fzRear), 0, 1) : 0;

        // Lateral tyre forces (Pacejka-lite with friction ellipse).
        let fyFront = 0;
        let fyRear = 0;
        if (v > 1.5) {
            const alphaF = Math.atan2(this.vy + this.a * this.yawRate, v) - this.steer;
            const alphaR = Math.atan2(this.vy - this.b * this.yawRate, v);
            fyFront = this._tyre(alphaF, fzFront, frontLong, muFront, this.stiffFront);
            fyRear = this._tyre(alphaR, fzRear, rearLong, muRear, this.stiffRear);
            this.slip = Math.max(Math.abs(alphaF), Math.abs(alphaR));
        } else {
            this.slip = 0;
        }
        this.fyFront = fyFront;
        this.fyRear = fyRear;

        // Resistances: aero, rolling, gravity on the gradient, gravel drag.
        const grade = track.gradeAt(this.s);
        const resist =
            this.drivetrain.resistance(v) +
            m * PHYS.g * grade +
            (onShoulder ? 0.06 * m * PHYS.g * clamp(v / 5, -1, 1) : 0);

        const mEff = this.drivetrain.effectiveMass(dtState.gear);
        const forceAccel = (rearLong + frontLong - fyFront * Math.sin(this.steer) - resist) / mEff;
        const ax = forceAccel + this.vy * this.yawRate;
        // Brakes, rolling resistance and the grade hold a car at rest and stop one rolling; only the
        // engine, pulling the way its gear turns the wheels, sets it moving either way.
        const way = Math.sign(this.drivetrain.ratio(dtState.gear));
        const next = this.vx + ax * dt;
        const pulling = drive * way > 0 && next * way > 0;
        this.vx = (Math.abs(v) <= 0.05 || next * v < 0) && !pulling ? 0 : next;
        // Weight transfer follows the tyre forces, not the kinematic term.
        this.longAccel = approach(this.longAccel, forceAccel, 5, dt);

        if (v > 3) {
            const ay = (fyFront * Math.cos(this.steer) + fyRear) / m - this.vx * this.yawRate;
            this.vy += ay * dt;
            const yawAcc = (this.a * fyFront * Math.cos(this.steer) - this.b * fyRear) / this.inertia;
            this.yawRate += yawAcc * dt;
            this.latAccel = approach(this.latAccel, (fyFront + fyRear) / m, 10, dt);
        } else {
            // Kinematic model at parking speeds.
            this.yawRate = (this.vx * Math.tan(this.steer)) / L;
            this.vy = approach(this.vy, 0, 10, dt);
            this.latAccel = approach(this.latAccel, 0, 10, dt);
        }

        // Integrate in road coordinates.
        const kappa = track.curvatureAt(this.s);
        const cosT = Math.cos(this.theta);
        const sinT = Math.sin(this.theta);
        const sDot = (this.vx * cosT - this.vy * sinT) / Math.max(0.2, 1 - this.u * kappa);
        const uDot = this.vx * sinT + this.vy * cosT;
        this.s += sDot * dt;
        this.u += uDot * dt;
        this.theta = wrapAngle(this.theta + (this.yawRate - kappa * sDot) * dt);
        this.sDot = sDot;
        if (Math.abs(sDot) > GAME.pullAwaySpeed) this.dir = Math.sign(sDot);

        return this._contacts(track, uDot);
    }

    /** Axle lateral force: Pacejka-like curve on full load, clipped by the grip `long` leaves over. */
    _tyre(alpha, load, long, mu, stiffness) {
        const cap = Math.sqrt(Math.max(0, (mu * load) ** 2 - long ** 2));
        const B = stiffness / (TYRE_SHAPE * mu);
        const force = -mu * load * Math.sin(TYRE_SHAPE * Math.atan(B * alpha));
        return clamp(force, -cap, cap);
    }

    /** Rock face, guard rail and the edge of the ledge. */
    _contacts(track, uDot) {
        const speed = Math.abs(this.vx);
        const wall = track.wallOffsetAt(this.s);
        if (this.u + HALF_CAR_WIDTH > wall) {
            const impact = Math.max(uDot, 0);
            if (speed > 9 && (impact > 1.2 || speed > 20)) {
                return { type: 'crash', cause: 'wall', impact: speed };
            }
            this._scrape(wall - HALF_CAR_WIDTH, -1);
            return null;
        }

        if (track.railAt(this.s) && this.u - HALF_CAR_WIDTH < ROAD.postOffset) {
            const impact = Math.max(-uDot, 0);
            // Hit hard enough the rail gives way, and the car goes through it and over the edge.
            if (impact > RAIL.breach) return { type: 'crash', cause: 'edge', impact: speed };
            if (speed > 9 && (impact > 1.2 || speed > 22)) {
                return { type: 'crash', cause: 'rail', impact: speed };
            }
            this._scrape(ROAD.postOffset + HALF_CAR_WIDTH, 1);
            return null;
        }

        if (this.u < ROAD.edgeOffset) {
            return { type: 'crash', cause: 'edge', impact: speed };
        }
        return null;
    }

    _scrape(limit, pushDir) {
        this.u = limit;
        this.vx *= 0.985;
        this.vy = pushDir * Math.abs(this.vy) * 0.3;
        // Turned towards the way along the road the car faces.
        const along = Math.abs(this.theta) > Math.PI / 2 ? Math.sign(this.theta) * Math.PI : 0;
        this.theta = along + (this.theta - along) * 0.6;
        this.yawRate *= 0.5;
    }

    /** Snapshot for HUD, audio and camera. */
    telemetry() {
        const e = this.engine;
        return {
            speed: Math.abs(this.vx),
            mph: this.speedMph,
            rpm: e.rpm,
            gear: e.gear,
            throttle: e.throttle,
            boost: e.boost,
            blown: e.blown,
            overRev: e.overRevTime,
            wheelspin: e.wheelspin,
            slip: this.slip,
            surface: this.surface,
            longAccel: this.longAccel,
            latAccel: this.latAccel,
            steer: this.steer / this.maxSteer(),
        };
    }
}
