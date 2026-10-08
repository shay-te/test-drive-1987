import { GAME, PHYS } from '../config.js';
import { approach, clamp, moveTowards } from '../util/math.js';
import { LANE, ONCOMING, SAME_WAY } from './Traffic.js';

const TOP_SPEED = 121 * PHYS.mph;
const ACCELERATION = 4.2;
const DETECTOR_RANGE = 800;
const PURSUIT_DETECTOR_RANGE = 600;
const GIVE_UP_GAP = 700;
/** After this long, a patrol car that is still far behind gives up. */
const CHASE_PATIENCE = 35;
const LOST_GAP = 300;
const ON_ROAD = 3;
const OVERTAKE_GAP = 45;
const PULL_OUT_RATE = 0.6;
const ONCOMING_CLEARANCE = 160;

export const POLICE_EVENT = Object.freeze({
    pursuit: 'pursuit',
    pulledOver: 'pulledOver',
    escaped: 'escaped',
});

/** Radar traps, the patrol car pursuit and the radar detector's signal. */
export class PoliceManager {
    constructor(track, traffic) {
        this.track = track;
        this.traffic = traffic;
        this.traps = track.traps.map((trap) => {
            return { ...trap, triggered: false, car: null };
        });
        this.pursuer = null;
    }

    /** Parks a patrol car in each trap's lay-by. */
    populate() {
        for (const trap of this.traps) {
            trap.car = this.traffic.add('police', { s: trap.s, u: trap.u, dir: SAME_WAY, scripted: true });
        }
    }

    get pursuing() {
        return this.pursuer !== null;
    }

    /** Advances the pursuit; returns a POLICE_EVENT or null. */
    update(dt, player) {
        let event = null;
        for (const trap of this.traps) {
            if (trap.triggered || player.s < trap.s) continue;
            trap.triggered = true;
            if (player.mph > GAME.radarTriggerMph && !this.pursuer && trap.car) {
                this.pursuer = trap.car;
                this.pursuer.siren = true;
                this.pursuer.chaseTime = 0;
                event = POLICE_EVENT.pursuit;
            }
        }
        if (!this.pursuer || event) return event;

        const cop = this.pursuer;
        const gap = player.s - cop.s;
        cop.chaseTime += dt;
        if (gap > GIVE_UP_GAP || (cop.chaseTime > CHASE_PATIENCE && gap > LOST_GAP)) {
            this._endPursuit();
            return POLICE_EVENT.escaped;
        }
        cop.speed = moveTowards(cop.speed, Math.min(TOP_SPEED, player.speed + 9), ACCELERATION * dt);
        cop.s += cop.speed * dt;
        cop.u = approach(cop.u, this._pursuitLane(cop, player, gap), PULL_OUT_RATE, dt);
        const alongside = gap < 1 && Math.abs(cop.u) < ON_ROAD && Math.abs(cop.u - player.u) > 1.6;
        return alongside ? POLICE_EVENT.pulledOver : null;
    }

    /** 0..1 strength of the radar detector: traps ahead and a patrol car behind. */
    radarSignal(player) {
        let signal = 0;
        for (const trap of this.traps) {
            const d = trap.s - player.s;
            if (!trap.triggered && d > 0 && d < DETECTOR_RANGE)
                signal = Math.max(signal, 1 - d / DETECTOR_RANGE);
        }
        if (this.pursuer) {
            const d = player.s - this.pursuer.s;
            signal = Math.max(signal, clamp(1 - d / PURSUIT_DETECTOR_RANGE, 0, 1));
        }
        return signal;
    }

    /** Sends the patrol car away after a ticket or an escape. */
    release() {
        this._endPursuit();
    }

    _pursuitLane(cop, player, gap) {
        if (gap > OVERTAKE_GAP) return LANE;
        const passLane = player.u > 0 ? -LANE : LANE;
        const blocked =
            this.traffic.ahead(cop.s, passLane, ONCOMING_CLEARANCE, SAME_WAY) ||
            this.traffic.vehicles.some((v) => {
                return (
                    v.dir === ONCOMING &&
                    v.s > cop.s &&
                    v.s - cop.s < ONCOMING_CLEARANCE &&
                    Math.abs(v.u - passLane) < 2
                );
            });
        return blocked ? cop.u : passLane;
    }

    _endPursuit() {
        if (!this.pursuer) return;
        this.traffic.remove(this.pursuer);
        for (const trap of this.traps) {
            if (trap.car === this.pursuer) trap.car = null;
        }
        this.pursuer = null;
    }
}
