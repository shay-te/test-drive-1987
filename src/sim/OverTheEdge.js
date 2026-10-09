import { FALL } from '../config.js';
import { rotate } from '../util/quaternion.js';
import { sub } from '../util/vector.js';
import { airLost, playerBody, underwater } from './wreckBodies.js';

/** A car gone over the edge: a rigid body launched with the car's last motion, tumbling down the drop
 *  until it stops, or into the sea, where it floats, fills and sinks; keeps the numbers of the fall. */
export class OverTheEdge {
    constructor(vehicle, track, landscape) {
        this.landscape = landscape;
        const { body, centre, startHeight } = playerBody(vehicle, track);
        this.body = body;
        this.centre = centre;
        this.startHeight = startHeight;
        this.time = 0;
        this.still = 0;
        this.topSpeed = this.body.speed;
        this.hardestHit = 0;
        this.deepestCrush = 0;
        this.sank = 0;
        this.accumulator = 0;
    }

    /** Runs the fall for `dt` seconds; returns the hardest hit (m/s) the car took in that time, 0 if
     *  none, as { player } like a road crash's hits, the speed it hit the water at (`splash`) and the
     *  air that escaped from it (`air`, m3). */
    update(dt) {
        const body = this.body;
        const sea = this.landscape.waterLevel;
        const flooded = body.flooded;
        let hit = 0;
        let splash = 0;
        this.accumulator += dt;
        while (this.accumulator >= FALL.substep && !this.done) {
            this.accumulator -= FALL.substep;
            body.step(FALL.substep, this.landscape);
            this.time += FALL.substep;
            this.topSpeed = Math.max(this.topSpeed, body.speed);
            this.deepestCrush = Math.max(this.deepestCrush, body.penetration);
            if (body.impact > FALL.hitSpeed) hit = Math.max(hit, body.impact);
            splash = Math.max(splash, body.splash);
            this.sank = Math.max(this.sank, sea - body.position.y);
            // A car still filling with water is not done: it is afloat, or still letting its air out.
            const filling = body.wet > 0 && body.flooded < 1;
            const resting = body.speed < FALL.restSpeed && body.spin < FALL.restSpin && !filling;
            this.still = resting ? this.still + FALL.substep : 0;
        }
        this.hardestHit = Math.max(this.hardestHit, hit);
        if (this.hardestHit > FALL.wreckSpeed) body.rollingShare = 1;
        return { player: hit, other: 0, splash, air: airLost(body, flooded) };
    }

    /** The car is under the sea's surface, deep enough to watch from beneath it. */
    get underwater() {
        return underwater(this.body, this.landscape.waterLevel);
    }

    get done() {
        return this.still >= FALL.restSeconds || this.time >= FALL.maxSeconds;
    }

    /** Where the car-space origin is and how the car is turned: the cabin and the camera ride on it. */
    get pose() {
        const q = this.body.orientation;
        return { position: sub(this.body.position, rotate(q, this.centre)), quaternion: q };
    }

    /** How far the car has fallen below the road it left (m). */
    get drop() {
        return this.startHeight - this.pose.position.y;
    }
}
