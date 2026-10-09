import { PHYS } from '../../src/config.js';
import { clamp } from '../../src/util/math.js';

const LOOKAHEAD = 260;
const LOOKAHEAD_STEP = 8;
const CORNER_MARGIN = 0.72;
const BRAKE_PLAN = 4;
const LANE_GAIN = 3;
/** Brake pressure per m/s over the planned speed. */
const BRAKE_GAIN = 0.35;
/** Running this far wide of the lane (m), the driver lifts off. */
const LANE_SLACK = 0.6;
const HEADING_GAIN = 2.2;

/** A careful test driver: plans corner speeds, brakes before bends rather than in them, lifts when the
 *  car runs wide, holds the right lane and shifts at the redline. */
export class Autopilot {
    constructor(vehicle, track, lane = 1.8) {
        this.vehicle = vehicle;
        this.track = track;
        this.lane = lane;
    }

    /** Highest speed from which the car can still slow down for every bend ahead. */
    targetSpeed() {
        const { vehicle, track } = this;
        const grip = vehicle.car.chassis.grip * PHYS.g * CORNER_MARGIN;
        let limit = Infinity;
        for (let d = 0; d < LOOKAHEAD; d += LOOKAHEAD_STEP) {
            const k = Math.abs(track.curvatureAt(vehicle.s + d));
            if (k < 1e-5) continue;
            const corner = Math.sqrt(grip / k);
            limit = Math.min(limit, Math.sqrt(corner * corner + 2 * BRAKE_PLAN * d));
        }
        return limit;
    }

    /** Pedals and steering for this frame; also works the gearbox. */
    drive() {
        const veh = this.vehicle;
        const v = Math.max(veh.vx, 5);
        const kappa = this.track.curvatureAt(veh.s);
        const wheelbase = veh.a + veh.b;
        const lateral = v * v * kappa + LANE_GAIN * (this.lane - veh.u) - HEADING_GAIN * v * veh.theta;
        const steerAngle = (wheelbase * lateral) / (v * v) + (0.011 * lateral) / PHYS.g;
        const vmax = this.targetSpeed();
        this._shift();
        // Squeezed on in proportion to the overspeed, and only with the grip cornering leaves free.
        const grip = veh.car.chassis.grip * PHYS.g;
        const free = Math.sqrt(Math.max(0, 1 - (v * v * kappa / grip) ** 2));
        return {
            steer: clamp(steerAngle / veh.maxSteer(), -1, 1),
            throttle: veh.vx < vmax - 1 && Math.abs(this.lane - veh.u) < LANE_SLACK ? 1 : 0,
            brake: clamp((veh.vx - vmax) * BRAKE_GAIN, 0, 1) * free,
        };
    }

    _shift() {
        const { drivetrain, engine, car } = this.vehicle;
        if (
            engine.gear === 0 ||
            (engine.gear < car.drivetrain.gears.length && engine.rpm > car.engine.redline - 150)
        ) {
            drivetrain.shift(engine, 1);
        } else if (engine.gear > 1 && engine.rpm < car.engine.redline * 0.45) {
            drivetrain.shift(engine, -1);
        }
    }
}

/** Drives `vehicle` until the finish or a crash; returns the outcome. */
export function runStage(vehicle, track, { dt = 1 / 60, maxTime = 600 } = {}) {
    const pilot = new Autopilot(vehicle, track);
    let time = 0;
    while (vehicle.s < track.finishS && time < maxTime) {
        const event = vehicle.step(dt, pilot.drive(), track);
        time += dt;
        if (event) return { finished: false, event, time, s: vehicle.s };
    }
    return { finished: vehicle.s >= track.finishS, event: null, time, s: vehicle.s };
}
