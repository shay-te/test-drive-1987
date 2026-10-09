import { GAME, PHYS, POLICE, ROAD } from '../config.js';
import { approach, clamp, moveTowards, smoothstep } from '../util/math.js';
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
/** A roadblock is sought this far apart along the road (m), and none closer than this to either end of
 *  the stage. */
const ROADBLOCK_STEP = 20;
const END_CLEAR = 400;

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
 *  then is an arrest), and the radar detector's signal. A player is { s, u, speed (m/s along the road,
 *  negative going back), mph, dir (the way they are going, as traffic's) }. */
export class PoliceManager {
    constructor(track, traffic) {
        this.track = track;
        this.traffic = traffic;
        this.traps = track.traps.map((trap) => {
            return { ...trap, triggered: false, car: null };
        });
        this.pursuer = null;
        this.fleeing = false;
        // The roadblock standing ({ s, dir: the way it faces traffic, cars, leaving }), and the seconds
        // until one is ready (null when none is on its way).
        this.roadblock = null;
        this.roadblockDue = null;
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

    /** Advances the pursuit for `player`; returns a POLICE_EVENT or null. */
    update(dt, player) {
        const clocked = this._radar(player);
        if (clocked) return clocked;
        const stopped = this._stopped(dt, player);
        if (stopped) return stopped;
        if (this.onTail) this._redeploy(player);
        if (this.roadblock?.leaving && Math.abs(this.roadblock.s - player.s) > POLICE.outOfSight) this._liftRoadblock();
        if (this.roadblockDue !== null) {
            this.roadblockDue -= dt;
            if (this.roadblockDue <= 0 && !this.roadblock?.leaving) return this._raiseRoadblock(player);
        }
        if (!this.pursuer) return null;

        const cop = this.pursuer;
        const gap = (player.s - cop.s) * cop.dir;
        cop.chaseTime += dt;
        if (Math.abs(gap) > GIVE_UP_GAP || (cop.chaseTime > CHASE_PATIENCE && Math.abs(gap) > LOST_GAP)) {
            this._endPursuit();
            // Nobody knows where the car went: no roadblock is set up for it any more.
            this.roadblockDue = null;
            return POLICE_EVENT.escaped;
        }
        if (gap < 0 || cop.turning > 0) {
            this._turn(dt, cop);
        } else {
            // Follows the car, never past it: no boxing in, no ramming.
            const wanted = clamp(player.speed * cop.dir + CLOSING * (gap - POLICE.followGap), 0, TOP_SPEED);
            cop.speed = moveTowards(cop.speed, wanted, ACCELERATION * dt);
            cop.s += cop.dir * Math.min(cop.speed * dt, Math.max(0, gap - POLICE.followGap));
            cop.u = approach(cop.u, LANE * cop.dir, PULL_IN_RATE, dt);
        }
        if (gap < POLICE.complyRange && !this.fleeing) {
            cop.signalled += dt;
            if (cop.signalled > POLICE.complySeconds) {
                this.fleeing = true;
                this.roadblockDue = POLICE.roadblockDelay;
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
                Object.assign(this.pursuer, { siren: true, chaseTime: 0, signalled: 0, turning: null });
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
        const signalled = this.pursuer && Math.abs(player.s - this.pursuer.s) < POLICE.signalRange;
        const before = this.roadblock && (this.roadblock.s - player.s) * this.roadblock.dir;
        const blocked = before > 0 && before < POLICE.roadblockReach;
        if (signalled && !this.fleeing) return POLICE_EVENT.ticket;
        if ((signalled && this.fleeing) || blocked) return POLICE_EVENT.arrested;
        return null;
    }

    /** A patrol car that the driver has gone back past brakes to a stop and turns round (a left U-turn
     *  across the road) to follow them the other way. */
    _turn(dt, cop) {
        if (cop.speed > 0) {
            cop.speed = Math.max(0, cop.speed - POLICE.brake * dt);
            cop.s += cop.dir * cop.speed * dt;
            return;
        }
        cop.turning = (cop.turning ?? 0) + dt;
        const done = Math.min(1, cop.turning / POLICE.turnSeconds);
        const from = LANE * cop.dir;
        cop.yaw = Math.PI * done;
        cop.u = from - 2 * from * smoothstep(0, 1, done);
        if (done < 1) return;
        Object.assign(cop, { dir: -cop.dir, yaw: 0, turning: null });
    }

    /** A driver who turns back has the roadblock's officers sent ahead of them: they leave it (once
     *  out of the driver's sight) and set up again ahead, `roadblockDelay` s later. */
    _redeploy(player) {
        const rb = this.roadblock;
        if (!rb) return;
        rb.leaving = rb.dir !== player.dir;
        if (rb.leaving && this.roadblockDue === null) this.roadblockDue = POLICE.roadblockDelay;
    }

    _liftRoadblock() {
        for (const car of this.roadblock?.cars ?? []) this.traffic.remove(car);
        this.roadblock = null;
    }

    /** Patrol cars across the road at the first place at least POLICE.lead m ahead (the way the player is
     *  going) that a driver at the player's speed sees in time to stop; none if one already stands there.
     *  Raised only once the last one has gone. */
    _raiseRoadblock(player) {
        this.roadblockDue = null;
        const { dir } = player;
        if (this.roadblock?.dir === dir) return null;
        const sight = player.speed ** 2 / (2 * POLICE.brake) + POLICE.margin;
        const [first, last] = [this.track.startS + END_CLEAR, this.track.finishS - END_CLEAR];
        for (let s = player.s + dir * POLICE.lead; s > first && s < last; s += dir * ROADBLOCK_STEP) {
            if (!this._seen(Math.min(s, s - dir * sight), Math.max(s, s - dir * sight), sight)) continue;
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
            this.roadblock = { s, dir, cars, leaving: false };
            return POLICE_EVENT.roadblock;
        }
        // No straight left before the end of the stage: the officers wait there instead.
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
            const d = Math.abs(player.s - this.pursuer.s);
            signal = Math.max(signal, clamp(1 - d / PURSUIT_DETECTOR_RANGE, 0, 1));
        }
        return signal;
    }

    /** Sends the patrol cars away after a ticket, an arrest or a crash. */
    release() {
        this._endPursuit();
        this._liftRoadblock();
        this.roadblockDue = null;
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
