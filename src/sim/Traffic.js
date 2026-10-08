import { PHYS, ROAD } from '../config.js';
import { CIVILIAN_TYPES, TRAFFIC_TYPES } from '../data/traffic.js';
import { approach, clamp, createRng } from '../util/math.js';

export const SAME_WAY = 1;
export const ONCOMING = -1;
export const LANE = ROAD.laneWidth / 2;

const WINDOW_BEHIND = 220;
const WINDOW_AHEAD = 1250;
const SPAWN_AHEAD_MIN = 750;
const MIN_GAP = 45;
const FOLLOW_DISTANCE = 32;
const PLAYER_LENGTH = 4.3;
const PLAYER_WIDTH = 1.8;

/** Spawns, drives and despawns the other road users around the player. */
export class TrafficManager {
    constructor(track, stage) {
        this.track = track;
        this.rng = createRng(stage.seed * 31 + 7);
        this.density = { [SAME_WAY]: stage.traffic.sameWay, [ONCOMING]: stage.traffic.oncoming };
        this.truckShare = stage.traffic.truckShare;
        this.vehicles = [];
        this.nextId = 1;
    }

    /** Creates a vehicle of `type` (see data/traffic.js) and adds it to the road. */
    add(type, props) {
        const spec = TRAFFIC_TYPES[type];
        const vehicle = {
            id: this.nextId++,
            type,
            length: spec.length,
            width: spec.width,
            height: spec.height,
            speed: 0,
            targetSpeed: 0,
            ...props,
        };
        this.vehicles.push(vehicle);
        return vehicle;
    }

    remove(vehicle) {
        this.vehicles = this.vehicles.filter((v) => {
            return v !== vehicle;
        });
    }

    /** Fills the road around the start so the stage doesn't begin empty. */
    populate(playerS) {
        for (const dir of [SAME_WAY, ONCOMING]) {
            const wanted = this._wanted(dir);
            for (let i = 0; i < wanted; i++) {
                this._spawn(dir, playerS + 150 + this.rng() * (WINDOW_AHEAD - 150));
            }
        }
    }

    update(dt, playerS) {
        for (const v of this.vehicles) {
            if (!v.scripted) this._drive(v, dt);
        }
        this.vehicles = this.vehicles.filter((v) => {
            return v.scripted || (v.s > playerS - WINDOW_BEHIND && v.s < playerS + WINDOW_AHEAD + 200);
        });
        for (const dir of [SAME_WAY, ONCOMING]) {
            if (this._count(dir) < this._wanted(dir)) {
                this._spawn(dir, playerS + SPAWN_AHEAD_MIN + this.rng() * (WINDOW_AHEAD - SPAWN_AHEAD_MIN));
            }
        }
    }

    /** The vehicle the player's footprint overlaps, or null (a wrecked one is no longer on the road). */
    collision(s, u) {
        return (
            this.vehicles.find((v) => {
                return (
                    !v.wrecked &&
                    Math.abs(v.s - s) < (v.length + PLAYER_LENGTH) / 2 &&
                    Math.abs(v.u - u) < (v.width + PLAYER_WIDTH) / 2
                );
            }) ?? null
        );
    }

    /** Clears vehicles near `s` so the player can restart after a crash. */
    clearAround(s, radius = 120) {
        this.vehicles = this.vehicles.filter((v) => {
            return v.scripted || Math.abs(v.s - s) > radius;
        });
    }

    /** Nearest vehicle ahead of `s` in the lane at `u` within `range`, or null. */
    ahead(s, u, range, dir = SAME_WAY) {
        let best = null;
        for (const v of this.vehicles) {
            const gap = (v.s - s) * dir;
            if (gap <= 0 || gap > range || Math.abs(v.u - u) > ROAD.laneWidth * 0.6) continue;
            if (!best || gap < (best.s - s) * dir) best = v;
        }
        return best;
    }

    _wanted(dir) {
        return Math.round((this.density[dir] * (WINDOW_AHEAD + WINDOW_BEHIND)) / 1000);
    }

    _count(dir) {
        return this.vehicles.filter((v) => {
            return v.dir === dir && !v.scripted;
        }).length;
    }

    _spawn(dir, s) {
        const { track, rng } = this;
        if (s < track.startS || s > track.length - 60) return null;
        const u = dir === SAME_WAY ? LANE : -LANE;
        const blocked = this.vehicles.some((v) => {
            return Math.abs(v.s - s) < MIN_GAP && Math.abs(v.u - u) < ROAD.laneWidth;
        });
        if (blocked) return null;
        const type = rng() < this.truckShare ? 'truck' : rng.pick(CIVILIAN_TYPES);
        const [lo, hi] = TRAFFIC_TYPES[type].speedMph;
        const cruise = rng.range(lo, hi) * PHYS.mph;
        return this.add(type, { s, u, dir, speed: cruise, cruise });
    }

    _drive(v, dt) {
        const grade = this.track.gradeAt(v.s) * v.dir;
        // Laden trucks crawl up the grade.
        const climb = v.type === 'truck' ? clamp(1 - grade * 5, 0.55, 1.1) : 1;
        let target = v.cruise * climb;
        const leader = this.ahead(v.s, v.u, FOLLOW_DISTANCE + v.length, v.dir);
        if (leader) target = Math.min(target, leader.speed * 0.98);
        v.speed = approach(v.speed, target, 0.8, dt);
        v.s += v.speed * v.dir * dt;
    }
}
