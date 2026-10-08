import { FALL } from '../config.js';
import { rotate } from '../util/quaternion.js';
import { sub } from '../util/vector.js';
import { playerBody } from './wreckBodies.js';

/** A car gone over the edge: a rigid body launched with the car's last motion, tumbling down the drop
 *  and the valley side until it stops, keeping the numbers of the fall. */
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
        this.accumulator = 0;
    }

    /** Runs the fall for `dt` seconds; returns the hardest hit (m/s) the car took in that time, 0 if
     *  none, as { player } like a road crash's hits. */
    update(dt) {
        const body = this.body;
        let hit = 0;
        this.accumulator += dt;
        while (this.accumulator >= FALL.substep && !this.done) {
            this.accumulator -= FALL.substep;
            body.step(FALL.substep, this.landscape);
            this.time += FALL.substep;
            this.topSpeed = Math.max(this.topSpeed, body.speed);
            this.deepestCrush = Math.max(this.deepestCrush, body.penetration);
            if (body.impact > FALL.hitSpeed) hit = Math.max(hit, body.impact);
            const resting = body.speed < FALL.restSpeed && body.spin < FALL.restSpin;
            this.still = resting ? this.still + FALL.substep : 0;
        }
        this.hardestHit = Math.max(this.hardestHit, hit);
        if (this.hardestHit > FALL.wreckSpeed) body.rollingShare = 1;
        return { player: hit, other: 0 };
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
