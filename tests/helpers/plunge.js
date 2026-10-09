import { carById } from '../../src/data/cars.js';
import { OverTheEdge } from '../../src/sim/OverTheEdge.js';
import { VehicleDynamics } from '../../src/sim/VehicleDynamics.js';

/** The car `carId` placed at node `i` aimed off the edge at `speed` (m/s), a little left of its lane. */
export function aimedOffTheEdge(track, i, carId = 'porsche', speed = 40) {
    const vehicle = new VehicleDynamics(carById(carId));
    vehicle.reset(i * track.segment, -3);
    vehicle.engine.gear = 3;
    vehicle.vx = speed;
    vehicle.theta = -0.25;
    return vehicle;
}

/** Coasts off the edge at node `i` and plays the fall out, recording when it hit and went under the water. */
export function fallFrom(track, landscape, i) {
    const vehicle = aimedOffTheEdge(track, i);
    let event = null;
    for (let k = 0; k < 1200 && !event; k++) event = vehicle.step(1 / 120, { steer: 0, throttle: 0, brake: 0 }, track);
    const fall = new OverTheEdge(vehicle, track, landscape);
    const log = { splash: 0, splashAt: null, underAt: null, air: 0 };
    while (!fall.done) {
        const hits = fall.update(1 / 60);
        if (hits.splash && log.splashAt === null) Object.assign(log, { splash: hits.splash, splashAt: fall.time });
        if (fall.underwater && log.underAt === null) log.underAt = fall.time;
        log.air += hits.air;
    }
    return { node: i, event, fall, log };
}

/** The first rail-free edge on a stage where a car going over at 90 mph ends up `deep` m under the sea. */
export function findPlunge(track, landscape, deep) {
    for (let i = Math.floor(track.startS / track.segment) + 60; i < track.count - 300; i += 5) {
        if (track.rail[i] || track.rail[i + 5] || track.rail[i + 10]) continue;
        const run = fallFrom(track, landscape, i);
        if (run.log.splashAt !== null && run.fall.sank > deep) return run;
    }
    throw new Error('No edge over the sea on the stage');
}
