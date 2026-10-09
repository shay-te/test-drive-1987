import { GAME, PHYS, POLICE, ROAD } from '../config.js';
import { approach, clamp, moveTowards } from '../util/math.js';
import { TRAFFIC_TYPES } from '../data/traffic.js';
import { LANE, SAME_WAY } from './Traffic.js';

const TOP_SPEED = 121 * PHYS.mph;
const ACCELERATION = 4.2;
const DETECTOR_RANGE = 800;
const PURSUIT_DETECTOR_RANGE = 600;
const GIVE_UP_GAP = 700;
/** After this long, a patrol car that is still far behind gives up. */
const CHASE_PATIENCE = 35;
const LOST_GAP = 300;
/** The patrol car closes its gap at this many m/s per m too far back, and keeps to the player's lane. */
const CLOSING = 0.6;
const PULL_IN_RATE = 0.6;
/** A roadblock is sought this far apart along the road (m), and none closer than this to the finish. */
const ROADBLOCK_STEP = 20;
const FINISH_CLEAR = 400;

export const POLICE_EVENT = Object.freeze({
    pursuit: 'pursuit',
    ticket: 'ticket',
    failedToStop: 'failedToStop',
    roadblock: 'roadblock',
    arrested: 'arrested',
    escaped: 'escaped',
});

/** Radar traps, the pursuit that follows a driver clocked speeding (POLICE: stop for it and get a
 *  ticket; drive on and the officer radios for assistance, a roadblock goes up ahead, and stopping
 *  then is an arrest), and the radar detector's signal. */
export class PoliceManager {
    constructor(track, traffic) {
        this.track = track;
        this.traffic = traffic;
        this.traps = track.traps.map((trap) => {
            return { ...trap, triggered: false, car: null };
        });
        this.pursuer = null;
        this.fleeing = false;
        this.roadblock = null;
        this.stoppedFor = 0;
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

    /** The patrol car is still right behind a driver who has failed to stop for it. */
    get onTail() {
        return this.fleeing && this.pursuer !== null;
    }

    /** Advances the pursuit for a player { s, u, speed, mph }; returns a POLICE_EVENT or null. */
    update(dt, player) {
        const clocked = this._radar(player);
        if (clocked) return clocked;
        const stopped = this._stopped(dt, player);
        if (stopped) return stopped;
        if (this.roadblock?.due !== undefined) {
            this.roadblock.due -= dt;
            if (this.roadblock.due <= 0) return this._raiseRoadblock(player);
        }
        if (!this.pursuer) return null;

        const cop = this.pursuer;
        const gap = player.s - cop.s;
        cop.chaseTime += dt;
        if (gap > GIVE_UP_GAP || (cop.chaseTime > CHASE_PATIENCE && gap > LOST_GAP)) {
            this._endPursuit();
            return POLICE_EVENT.escaped;
        }
        // Follows the car, never past it: no boxing in, no ramming.
        const wanted = clamp(player.speed + CLOSING * (gap - POLICE.followGap), 0, TOP_SPEED);
        cop.speed = moveTowards(cop.speed, wanted, ACCELERATION * dt);
        cop.s = Math.min(cop.s + cop.speed * dt, player.s - POLICE.followGap);
        cop.u = approach(cop.u, LANE, PULL_IN_RATE, dt);
        if (gap < POLICE.complyRange && !this.fleeing) {
            cop.signalled += dt;
            if (cop.signalled > POLICE.complySeconds) {
                this.fleeing = true;
                this.roadblock = { due: POLICE.roadblockDelay };
                return POLICE_EVENT.failedToStop;
            }
        }
        return null;
    }

    /** A trap the player passes clocks them; above the trigger speed its patrol car pulls out. */
    _radar(player) {
        for (const trap of this.traps) {
            if (trap.triggered || player.s < trap.s) continue;
            trap.triggered = true;
            if (player.mph > GAME.radarTriggerMph && !this.pursuer && trap.car) {
                this.pursuer = trap.car;
                Object.assign(this.pursuer, { siren: true, chaseTime: 0, signalled: 0 });
                return POLICE_EVENT.pursuit;
            }
        }
        return null;
    }

    /** A player who has stopped for the patrol car behind gets a ticket, or is arrested if they had
     *  failed to stop; stopping at the roadblock is an arrest too. */
    _stopped(dt, player) {
        this.stoppedFor = player.mph < POLICE.stoppedMph ? this.stoppedFor + dt : 0;
        if (this.stoppedFor < POLICE.stopSeconds) return null;
        const signalled = this.pursuer && player.s - this.pursuer.s < POLICE.signalRange;
        const blocked = this.roadblock?.s !== undefined && this.roadblock.s - player.s < POLICE.roadblockReach && this.roadblock.s > player.s;
        if (signalled && !this.fleeing) return POLICE_EVENT.ticket;
        if ((signalled && this.fleeing) || blocked) return POLICE_EVENT.arrested;
        return null;
    }

    /** Patrol cars across the road at the first place at least POLICE.lead m ahead that a driver at the
     *  player's speed sees in time to stop. */
    _raiseRoadblock(player) {
        const sight = player.speed ** 2 / (2 * POLICE.brake) + POLICE.margin;
        const last = this.track.finishS - FINISH_CLEAR;
        for (let s = player.s + POLICE.lead; s < last; s += ROADBLOCK_STEP) {
            if (!this._seen(s - sight, s, sight)) continue;
            // Broadside to the road (the car's length across it), side by side from the edge to the cut.
            const { length, width } = TRAFFIC_TYPES.police;
            const [left, right] = [ROAD.edgeOffset, this.track.wallOffsetAt(s)];
            const count = Math.ceil((right - left) / length);
            const cars = Array.from({ length: count }, (_, i) => {
                const u = left + ((i + 0.5) * (right - left)) / count;
                return this.traffic.add('police', {
                    s, u, dir: SAME_WAY, scripted: true, siren: true, speed: 0, yaw: Math.PI / 2, length: width, width: length,
                });
            });
            this.roadblock = { s, cars };
            return POLICE_EVENT.roadblock;
        }
        // No straight left before the finish: the officers wait at the gas station instead.
        this.roadblock = null;
        return null;
    }

    /** Whether every bend from `from` to `to` is gentle enough to see `sight` m along it. */
    _seen(from, to, sight) {
        const tightest = (sight * sight) / (8 * POLICE.sightClearance);
        for (let s = Math.max(0, from); s <= to; s += this.track.segment) {
            if (Math.abs(this.track.curvatureAt(s)) > 1 / tightest) return false;
        }
        return true;
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

    /** Sends the patrol cars away after a ticket, an arrest or a crash. */
    release() {
        this._endPursuit();
        for (const car of this.roadblock?.cars ?? []) this.traffic.remove(car);
        this.roadblock = null;
        this.fleeing = false;
        this.stoppedFor = 0;
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
