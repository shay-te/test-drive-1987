import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRASH, FALL, PHYS, ROAD } from '../src/config.js';
import { carById } from '../src/data/cars.js';
import { STAGES } from '../src/data/stages.js';
import { Landscape } from '../src/sim/Landscape.js';
import { RoadCrash } from '../src/sim/RoadCrash.js';
import { TreeTrunks } from '../src/sim/TreeTrunks.js';
import { LANE, ONCOMING, SAME_WAY, TrafficManager } from '../src/sim/Traffic.js';
import { buildTrack } from '../src/sim/TrackBuilder.js';
import { VehicleDynamics } from '../src/sim/VehicleDynamics.js';
import { conjugate, rotate } from '../src/util/quaternion.js';

const stage = STAGES[0];
const track = buildTrack(stage);
const landscape = new Landscape(track, stage);
/** A straight, level, rail-free stretch well clear of the start. */
const s0 = (() => {
    let i = Math.floor(track.startS / track.segment) + 80;
    const level = (j) => { return Math.abs(track.elevation[j + 10] - track.elevation[j - 10]) < 0.02 * 20 * track.segment; };
    while (track.rail[i] || track.rail[i + 10] || Math.abs(track.curvature[i]) > 0.002 || !level(i)) i++;
    return i * track.segment;
})();

/** The player's Porsche at `mph` in its lane at s0. */
function player(mph, u = LANE) {
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(s0, u);
    vehicle.vx = mph * PHYS.mph;
    return vehicle;
}

/** A real traffic vehicle of `type` just ahead of the player, driving at `mph`. */
function traffic(type, dir, mph) {
    const manager = new TrafficManager(track, stage);
    return manager.add(type, { s: s0 + 4, u: dir === SAME_WAY ? LANE : LANE - 0.4, dir, speed: mph * PHYS.mph, scripted: true });
}

/** Where along the road and across it a crash's car is. */
const placeOf = (pose) => { return track.project(pose.position.x, pose.position.z, 0); };

/** A body's kinetic energy, moving and spinning, plus its height energy (J). */
function energy(body) {
    const w = rotate(conjugate(body.orientation), body.angularVelocity);
    const { x, y, z } = body.inertia;
    const spinning = 0.5 * (x * w.x * w.x + y * w.y * w.y + z * w.z * w.z);
    return 0.5 * body.mass * body.speed * body.speed + spinning + body.mass * PHYS.g * body.position.y;
}

/** Plays a crash to the end; how high each car got off the ground under it while over the road (one
 *  thrown off the edge tumbles on down the drop), how far into the rock, and the most the crash's
 *  energy ever exceeded what the impact left it with (J). */
function playOut(crash) {
    const above = ({ position }) => {
        return position.y - crash.ground.heightAt(position.x, position.z);
    };
    let playerTop = 0;
    let otherTop = 0;
    let intoRock = -Infinity;
    const total = () => { return crash.bodies.reduce((sum, body) => { return sum + energy(body); }, 0); };
    const start = total();
    let gained = 0;
    while (!crash.done) {
        crash.update(1 / 60);
        gained = Math.max(gained, total() - start);
        const { x, z } = crash.pose.position;
        const at = track.project(x, z, 0);
        if (at.u > ROAD.edgeOffset) playerTop = Math.max(playerTop, above(crash.pose));
        if (crash.otherPose) otherTop = Math.max(otherTop, above(crash.otherPose));
        intoRock = Math.max(intoRock, at.u - track.wallOffsetAt(at.s) - CRASH.wallGap);
    }
    return { playerTop, otherTop, intoRock, gained };
}

test('head-on with the refuse truck, the light car is thrown up and back; the truck barely lifts', () => {
    const vehicle = player(80);
    const truck = traffic('truck', ONCOMING, 40);
    const crash = new RoadCrash(vehicle, track, landscape, truck);
    assert.ok(crash.body.velocity.y > 3, 'the Porsche rides up the truck');
    const along = crash.body.velocity;
    const forward = { x: track.toWorld(s0 + 1, 0).x - track.toWorld(s0, 0).x, z: track.toWorld(s0 + 1, 0).z - track.toWorld(s0, 0).z };
    assert.ok(along.x * forward.x + along.z * forward.z < 0, 'thrown back the way it came');
    const { playerTop, otherTop, intoRock, gained } = playOut(crash);
    // Tumbling end over end, a landing corner can turn spin into another, higher bounce.
    assert.ok(playerTop > 1 && playerTop < 6, `the car is thrown into the air, not into orbit (${playerTop.toFixed(1)} m)`);
    assert.ok(gained < 1000, `the tumbling cars gained ${(gained / 1000).toFixed(1)} kJ from nowhere`);
    assert.ok(intoRock < 0.5, `bounces off the rock face instead of climbing it (${intoRock.toFixed(2)} m in)`);
    assert.ok(otherTop < 1, `the truck stays on the ground (${otherTop.toFixed(2)} m)`);
    // On the road the wreck stops playing at its time limit; one thrown over the edge falls as long as a fall.
    const limit = placeOf(crash.pose).u < ROAD.edgeOffset ? FALL.maxSeconds : CRASH.maxSeconds;
    assert.ok(crash.time <= limit + FALL.substep, 'stops playing at the time limit');
});

test('a gentle nudge into a slower car ahead stays on the ground', () => {
    const crash = new RoadCrash(player(35), track, landscape, traffic('beetle', SAME_WAY, 30));
    const { playerTop, otherTop } = playOut(crash);
    assert.ok(playerTop < 0.5 && otherTop < 0.5, `${playerTop.toFixed(2)} / ${otherTop.toFixed(2)} m`);
});

test('glancing off the rock face the car is pushed back to the road, not launched', () => {
    const vehicle = player(60, track.wallOffsetAt(s0) - 1);
    vehicle.vy = 6;
    const crash = new RoadCrash(vehicle, track, landscape);
    const { playerTop, intoRock } = playOut(crash);
    assert.ok(playerTop < 2.5, `rose ${playerTop.toFixed(2)} m`);
    assert.ok(intoRock < 0.5, `${intoRock.toFixed(2)} m into the rock`);
    const end = track.project(crash.pose.position.x, crash.pose.position.z, 0);
    assert.ok(end.u < track.wallOffsetAt(end.s) + CRASH.wallGap, 'ends in front of the rock face');
});

test('thrown towards the rock face on a bend, the car bounces off it rather than climbing it', () => {
    // The game's own case: 90 mph into an oncoming refuse truck 700 m into the stage.
    const s = track.startS + 700;
    const vehicle = new VehicleDynamics(carById('porsche'));
    vehicle.reset(s, LANE);
    vehicle.vx = 40;
    const truck = new TrafficManager(track, stage).add('truck', { s: s + 6, u: 1.6, dir: ONCOMING, speed: 18, scripted: true });
    const crash = new RoadCrash(vehicle, track, landscape, truck);
    let intoRock = -Infinity;
    while (!crash.done) {
        crash.update(1 / 60);
        const { x, z } = crash.pose.position;
        const at = track.project(x, z, 0);
        intoRock = Math.max(intoRock, at.u - track.wallOffsetAt(at.s) - CRASH.wallGap);
    }
    assert.ok(intoRock < 0.5, `${intoRock.toFixed(2)} m into the rock`);
});


test('the trees are solid: a car driven into a trunk stops against it, not through it', () => {
    const vehicle = player(45, LANE);
    const at = track.toWorld(s0 + 14, LANE, 0);
    const trunks = new TreeTrunks([{ x: at.x, y: at.y, z: at.z, height: 25 }]);
    assert.equal(trunks.near(at.x, at.z, 1).length, 1);
    assert.equal(trunks.near(at.x + 40, at.z, 5).length, 0, 'only the trees near by');
    const crash = new RoadCrash(vehicle, track, landscape, null, { trunks });
    let hardest = 0;
    let furthest = -Infinity;
    while (!crash.done) {
        hardest = Math.max(hardest, crash.update(1 / 60).player);
        furthest = Math.max(furthest, placeOf(crash.pose).s);
    }
    assert.ok(hardest > 10, `hit the tree at ${hardest.toFixed(1)} m/s`);
    assert.ok(furthest < s0 + 14, `${(furthest - s0 - 14).toFixed(1)} m past the trunk`);
});

test('a chain crash: the car hit is flung into a standing car, which joins the wreck instead of being passed through', () => {
    const manager = new TrafficManager(track, stage);
    const hit = manager.add('beetle', { s: s0 + 4, u: LANE, dir: SAME_WAY, speed: 5, scripted: true });
    const standing = manager.add('continental', { s: s0 + 13, u: LANE, dir: SAME_WAY, speed: 0, scripted: true });
    const crash = new RoadCrash(player(70), track, landscape, hit, { traffic: manager });
    let order = Infinity;
    while (!crash.done) {
        crash.update(1 / 60);
        const [first, second] = crash.wrecked.map(({ pose }) => { return placeOf(pose).s; });
        if (second !== undefined) order = Math.min(order, second - first);
    }
    assert.deepEqual(crash.wrecked.map(({ vehicle }) => { return vehicle; }), [hit, standing], 'both cars in the wreck');
    assert.ok(standing.wrecked && standing.scripted, 'out of the traffic');
    assert.ok(order > 0, 'the car hit never went through the standing one');
    assert.ok(placeOf(crash.wrecked[1].pose).s > s0 + 13.5, 'the standing car was shoved on');
});

test('traffic still driving runs into the wreck and joins it', () => {
    const manager = new TrafficManager(track, stage);
    const crash = new RoadCrash(player(45, track.wallOffsetAt(s0) - 1), track, landscape, null, { traffic: manager });
    for (let k = 0; k < 30; k++) crash.update(1 / 60);
    const wreck = placeOf(crash.pose);
    const late = manager.add('continental', { s: wreck.s + 60, u: -LANE, dir: ONCOMING, speed: 20, cruise: 20 });
    late.u = wreck.u;
    while (!crash.done) {
        crash.update(1 / 60);
        manager.update(1 / 60, wreck.s);
    }
    assert.ok(late.wrecked, 'the oncoming car ran into the wreck');
    assert.ok(crash.wrecked.some(({ vehicle }) => { return vehicle === late; }));
});

test('a road crash that throws the car over the edge plays on down the drop instead of stopping at the time limit', () => {
    const vehicle = player(60, track.wallOffsetAt(s0) - 1);
    vehicle.vy = 6;
    const crash = new RoadCrash(vehicle, track, landscape);
    while (!crash.done) crash.update(1 / 60);
    const end = placeOf(crash.pose);
    assert.ok(end.u < ROAD.edgeOffset, 'it went over the edge');
    assert.ok(crash.time > CRASH.maxSeconds, `stopped playing at ${crash.time.toFixed(1)} s`);
    assert.ok(crash.still >= FALL.restSeconds || crash.time >= FALL.maxSeconds, 'played until it came to rest');
});
