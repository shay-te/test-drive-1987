import { DriveSoundscape } from '../../audio/DriveSoundscape.js';
import { CockpitState } from '../../cockpit/CockpitState.js';
import { HeadMotion } from '../../cockpit/HeadMotion.js';
import { boostPsi, instrumentReadings, lampStates, revState } from '../../cockpit/instruments.js';
import { tripInfo, tripLines } from '../../cockpit/tripDisplay.js';
import { CRASH, GAME, MOTION, PHYS } from '../../config.js';
import { gearLabel } from '../../data/cars.js';
import { STAGES } from '../../data/stages.js';
import { inputKey, t } from '../../i18n/i18n.js';
import { POLICE_EVENT, PoliceManager } from '../../sim/Police.js';
import { OverTheEdge } from '../../sim/OverTheEdge.js';
import { RoadCrash } from '../../sim/RoadCrash.js';
import { CRASH_CAUSE } from '../../sim/Session.js';
import { LANE, ONCOMING, TrafficManager } from '../../sim/Traffic.js';
import { VehicleDynamics } from '../../sim/VehicleDynamics.js';
import { WaterParticles } from '../../sim/WaterParticles.js';
import { approach } from '../../util/math.js';
import {
    drawCrash,
    drawLoading,
    drawGear,
    drawOutsideReadout,
    drawPaused,
    drawStageIntro,
    drawArrest,
    drawMirrorFrame,
    drawTicket,
    drawToast,
} from '../driveOverlays.js';
import { COLORS } from '../theme.js';
import { ImpactGate } from '../../audio/impactGate.js';

const STEP = 1 / GAME.physicsHz;
const INTRO_SECONDS = 4;
const TOAST_SECONDS = 3;
/** How loud a blown engine goes, and the car a crash hits against the player's. */
const ENGINE_BLOW_VOLUME = 0.5;
const OTHER_CAR_VOLUME = 0.5;
/** After a crash the car restarts this far back, in the right-hand lane. */
const RESPAWN_BACK = 25;
/** Fuel gauge drop over a full stage (cosmetic). */
const FUEL_USED = 0.6;
/** Impacts above this speed (m/s) crack the windshield; each one more, until it is shattered. */
const CRACK_IMPACT = 6;
const MAX_CRACKS = 5;
/** Where on the glass an impact can crack it (layout px), the fall's tilt per second, body sway rate. */
const CRACK_AREA = { x: 380, y: 120, w: 520, h: 220 };
const BODY_RATE = 6;

/** One stage of driving: physics, traffic, police and the rules, seen from the driver's seat. */
export class DriveScreen {
    constructor({ game, audio, input, world, stages }) {
        Object.assign(this, { game, audio, input, world, stages });
        this.state = 'loading';
        this.loadingShown = false;
        this.loadingStarted = false;
        this.loadError = false;
        this.exited = false;
        this.time = 0;
        this.paused = false;
        this.digital = false;
        this.toast = null;
        this.shiftHint = false;
        this.soundscape = null;
    }

    /** `outside` keeps the camera chosen on the last stage. */
    enter({ session, outside = false }) {
        this.input.setLookEnabled(true);
        this.outside = outside;
        this.session = session;
        this.car = session.car;
        session.beginStage();
    }

    exit() {
        this.exited = true;
        this.input.setLookEnabled(false);
        this.soundscape?.stop();
        this.soundscape = null;
    }

    /** Once the loading notice shows: waits for the stage the loader has been preparing in the
     *  background (since the title screen, or the stage before) and for the car's cabin. */
    _load() {
        if (this.loadingStarted) return;
        this.loadingStarted = true;
        Promise.all([this.stages.prepare(this.session.stageIndex), this.world.prepareCabin(this.car)]).then(([stage, cabin]) => {
            if (!this.exited) this._build(stage, cabin);
        }).catch((error) => {
            console.error('[world] Stage preparation failed', error);
            if (!this.exited) this.loadError = true;
        });
    }

    /** Puts the prepared stage (its laid-out `track` and `landscape`) and the car's cabin together. */
    _build({ track, landscape }, cabinAsset) {
        const { car, session } = this;
        this.track = track;
        this.landscape = landscape;
        this.water = new WaterParticles(this.landscape.waterLevel, session.stage.seed);
        this.sunk = false;
        this.world.load(this.track, session.stage, car, this.landscape, cabinAsset);
        this.vehicle = new VehicleDynamics(car);
        this.vehicle.reset(this.track.startS, LANE);
        this.traffic = new TrafficManager(this.track, session.stage);
        this.traffic.populate(this.track.startS);
        this.police = new PoliceManager(this.track, this.traffic);
        this.police.populate();
        this.cockpit = new CockpitState(car);
        this.head = new HeadMotion(session.stageIndex + 1);
        this.accumulator = 0;
        this.bodyPitch = 0;
        this.bodyRoll = 0;
        this.cracks = [];
        this.wreck = null;
        this.wrecked = null;
        this.stageTime = 0;
        if (this.audio.ready) {
            this.audio.createEngine(car).then((engine) => {
                this.soundscape = new DriveSoundscape(this.audio, engine);
            });
        }
        // The next stage gets ready in the background while this one is driven.
        const next = session.stageIndex + 1;
        this.stages.keep(session.stageIndex, next);
        if (next < STAGES.length) this.stages.prepare(next);
        this.world.warmUp().catch((error) => {
            console.warn('[world] Shaders could not be compiled ahead; the first frames will', error);
        }).then(() => {
            if (!this.exited) this.state = 'driving';
        });
    }

    update(dt) {
        this.time += dt;
        if (this.state === 'loading') {
            if (this.loadError && this.input.pressed('back')) {
                this._leave('select', { carId: this.car.id });
                return;
            }
            if (this.loadError && this.input.pressed('confirm')) {
                this.loadError = false;
                this.loadingStarted = false;
            }
            if (!this.loadingShown || this.loadError) return;
            this._load();
            if (this.state === 'loading') return;
        }
        const input = this.input;
        if (input.pressed('pause') || (input.pressed('back') && !this.paused)) {
            this.paused = !this.paused;
        } else if (this.paused && input.pressed('back')) {
            this._leave('select', { carId: this.car.id });
            return;
        }
        if (input.pressed('toggleDigital')) this.digital = !this.digital;
        if (input.pressed('toggleView')) this.outside = !this.outside;
        if (!this.paused) this._advance(dt);
        if (this.state === 'results') return;
        this.view = this._view(dt);
        this._sound(dt);
    }

    _advance(dt) {
        this.stageTime += dt;
        if (this.toast) this.toast.time += dt;
        if (this.state === 'driving') this._drive(dt);
        else if (this.state === 'wrecking') this._wrecking(dt);
        else if (this.state === 'ticket' && this.input.pressed('confirm')) this._afterTicket();
        else if (this.state === 'arrested' && this.input.pressed('confirm')) this._afterArrest();
        else if (this.state === 'crashed' && this.input.pressed('confirm')) this._afterCrash();
    }

    _drive(dt) {
        const { input, vehicle } = this;
        if (input.pressed('shiftUp')) this._shift(1);
        if (input.pressed('shiftDown')) this._shift(-1);
        const controls = { steer: input.steering(), throttle: input.throttle(), brake: input.brake() };
        if (controls.throttle > 0 && vehicle.engine.gear === 0 && vehicle.vx < GAME.pullAwaySpeed)
            this._shift(1);
        this.accumulator += dt;
        while (this.accumulator >= STEP && this.state === 'driving') {
            this.accumulator -= STEP;
            this._step(STEP, controls);
        }
        if (vehicle.s >= this.track.finishS && this.state === 'driving') {
            // A patrol car still on the tail of a driver who would not stop follows them into the station.
            if (this.police.onTail) this.state = 'arrested';
            else this._finish();
        }
    }

    _step(h, controls) {
        const { vehicle, session } = this;
        const event = vehicle.step(h, controls, this.track);
        session.tick(h);
        this.traffic.update(h, vehicle.s);
        if (event) {
            this._crash(event.cause, event.impact);
            return;
        }
        const hit = this.traffic.collision(vehicle.s, vehicle.u);
        if (hit) {
            const cause =
                hit.type === 'police'
                    ? CRASH_CAUSE.police
                    : hit.dir === ONCOMING
                      ? CRASH_CAUSE.headOn
                      : CRASH_CAUSE.rearEnd;
            this._crash(cause, Math.abs(vehicle.vx - hit.speed * hit.dir), hit);
            return;
        }
        if (vehicle.engine.blown) {
            this._crash(CRASH_CAUSE.engine, 0);
            return;
        }
        const player = { s: vehicle.s, u: vehicle.u, speed: vehicle.vx, mph: vehicle.speedMph };
        const police = this.police.update(h, player);
        if (police === POLICE_EVENT.pursuit) {
            this.clockedMph = player.mph;
            this._notice(t('drive.pursuit'), COLORS.danger);
        } else if (police === POLICE_EVENT.failedToStop) {
            this._notice(t('drive.failedToStop'), COLORS.danger);
        } else if (police === POLICE_EVENT.escaped) {
            this._notice(t('drive.escaped'), COLORS.lcd);
        } else if (police === POLICE_EVENT.ticket) {
            this.state = 'ticket';
        } else if (police === POLICE_EVENT.arrested) {
            this.state = 'arrested';
        }
    }

    _shift(direction) {
        if (this.vehicle.drivetrain.shift(this.vehicle.engine, direction)) {
            this.audio.play('shift', { volume: 0.6 });
        }
    }

    _notice(text, color) {
        this.toast = { text, color, time: 0 };
    }

    /** `other` is the traffic vehicle hit, if any. A blown engine just stops; any other crash is played
     *  out: over the edge the car tumbles down the drop, on the road the cars are thrown apart. */
    _crash(cause, impact, other = null) {
        this.cause = cause;
        this.over = this.session.recordCrash(cause);
        this.head.jolt(impact);
        if (cause === CRASH_CAUSE.engine) {
            this.audio.play('impact', { volume: ENGINE_BLOW_VOLUME });
            this.state = 'crashed';
            return;
        }
        this.impacts = new ImpactGate();
        this.otherImpacts = new ImpactGate();
        // Driving off the edge is silent until the car lands; breaking through a rail on the way is not.
        if (cause !== CRASH_CAUSE.edge || this.track.railAt(this.vehicle.s)) {
            this.audio.play('crash', { volume: this.impacts.hear(0, impact) });
            this._crack(impact);
        }
        this.impactAt = { s: this.vehicle.s, u: this.vehicle.u };
        const { vehicle, track, landscape } = this;
        this.wreck = cause === CRASH_CAUSE.edge
            ? new OverTheEdge(vehicle, track, landscape)
            : new RoadCrash(vehicle, track, landscape, other);
        if (other) {
            // The car hit leaves the traffic and follows its own wreck.
            other.scripted = true;
            other.wrecked = true;
            this.wrecked = other;
        }
        this.state = 'wrecking';
    }

    /** Another crack across the windshield for a hard enough hit, up to shattered. */
    _crack(impact) {
        if (impact <= CRACK_IMPACT || this.cracks.length >= MAX_CRACKS) return;
        this.audio.play('crack', { volume: Math.min(1, impact / CRASH.sound.loud) });
        this.cracks = [...this.cracks, {
            x: CRACK_AREA.x + Math.random() * CRACK_AREA.w,
            y: CRACK_AREA.y + Math.random() * CRACK_AREA.h,
            seed: Math.floor(this.time * 1000) + this.cracks.length,
        }];
    }

    /** The wreck plays until the cars stop; every hard hit is heard, felt and may break more glass. */
    _wrecking(dt) {
        const hits = this.wreck.update(dt);
        const heard = this.impacts.hear(this.wreck.time, hits.player);
        if (heard) {
            this.audio.play('impact', { volume: heard });
            this.head.jolt(hits.player);
            this._crack(hits.player);
        }
        const other = this.otherImpacts.hear(this.wreck.time, hits.other);
        if (other) this.audio.play('impact', { volume: other * OTHER_CAR_VOLUME });
        this._sea(hits, dt);
        if (this.wrecked) this.wrecked.pose = this.wreck.otherPose;
        const skip = this.wreck.time > CRASH.skipAfter && this.input.pressed('confirm');
        if (this.wreck.done || skip) this.state = 'crashed';
    }

    /** Into the sea: a splash where the car went in, the air bubbling out of it, a glug as it goes under. */
    _sea(hits, dt) {
        const at = this.wreck.body.position;
        if (hits.splash) {
            this.audio.play('splash', { volume: Math.min(1, hits.splash / CRASH.sound.loud) });
            this.water.splash(at, hits.splash);
        }
        if (hits.air) this.water.bubble(at, hits.air);
        if (this.wreck.underwater && !this.sunk) {
            this.sunk = true;
            this.audio.play('bubbles');
        }
        this.water.update(dt);
    }

    _afterCrash() {
        if (this.over) {
            this._leave('results', { session: this.session });
            return;
        }
        const s = Math.max(this.track.startS, this.vehicle.s - RESPAWN_BACK);
        this.vehicle.reset(s, LANE);
        if (this.wrecked) this.traffic.remove(this.wrecked);
        this.wrecked = null;
        this.traffic.clearAround(s);
        this.police.release();
        this.cracks = [];
        this.wreck = null;
        this.water.clear();
        this.sunk = false;
        this.state = 'driving';
    }

    /** Stopped for the patrol car: the ticket is written, the patrol car leaves and the drive goes on. */
    _afterTicket() {
        this.session.recordTicket();
        this.police.release();
        this.state = 'driving';
    }

    /** Arrested for failing to stop: jail, the end of the run. */
    _afterArrest() {
        this.session.recordArrest();
        this._leave('results', { session: this.session });
    }

    _finish() {
        const result = this.session.finishStage(this.track.finishS - this.track.startS);
        this._leave(this.session.over ? 'results' : 'station', { session: this.session, result, outside: this.outside });
    }

    /** Hands over to the next screen; nothing else of this stage runs afterwards. */
    _leave(screen, params) {
        this.state = 'results';
        this.game.go(screen, params);
    }

    _sound(dt) {
        if (!this.soundscape || this.state === 'loading') return;
        const pursuer = this.police.pursuer;
        this.soundscape.update(dt, {
            ...this.vehicle.telemetry(),
            radar: this.police.radarSignal(this.vehicle),
            sirenDistance: pursuer ? this.vehicle.s - pursuer.s : null,
            paused: this.paused || this.state === 'crashed',
            // A crash stalls the engine; it starts again when the car is back on the road.
            engineOff: this.state === 'wrecking' || this.state === 'crashed',
        });
    }

    render(ctx) {
        if (this.state === 'loading') {
            this.world.clear();
            drawLoading(ctx, this.time, this.input.touch, this.loadError);
            this.loadingShown = true;
            return;
        }
        this.world.render(this.view);
        this._overlays(ctx);
    }

    /** Everything the world and the cabin need for this frame. */
    _view(dt) {
        const { vehicle, track, session, car } = this;
        const telemetry = vehicle.telemetry();
        const gears = car.drivetrain.gears.length;
        this.shiftHint =
            telemetry.gear > 0 &&
            telemetry.gear < gears &&
            telemetry.rpm > car.engine.redline - GAME.shiftHintRpm;
        const progress = (vehicle.s - track.startS) / (track.finishS - track.startS);
        const readings = instrumentReadings(telemetry, car, { fuel: 1 - progress * FUEL_USED });
        this.cockpit.update(dt, readings, telemetry.gear, { throttle: vehicle.throttle, brake: vehicle.brake });
        const head = this.head.update(dt, { ...telemetry, speed: this.paused ? 0 : telemetry.speed }, this.input.look());
        const g = PHYS.g;
        this.bodyPitch = approach(
            this.bodyPitch,
            (telemetry.longAccel / g) * MOTION.bodyPitchPerG,
            BODY_RATE,
            dt,
        );
        this.bodyRoll = approach(
            this.bodyRoll,
            (telemetry.latAccel / g) * MOTION.bodyRollPerG,
            BODY_RATE,
            dt,
        );
        return {
            s: vehicle.s,
            u: vehicle.u,
            theta: vehicle.theta,
            pitch: Math.atan(track.gradeAt(vehicle.s)) + this.bodyPitch,
            roll: this.bodyRoll,
            pose: this.wreck?.pose ?? null,
            // A crash is watched from beside it, whichever view was chosen.
            spectator: this.wreck ? this.impactAt : null,
            underwater: Boolean(this.wreck?.underwater),
            water: this.water,
            head,
            cockpit: {
                state: this.cockpit,
                readings,
                lamps: lampStates(telemetry, car, this.time),
                steer: telemetry.steer,
                radar: this.police.radarSignal(vehicle),
                cracks: this.cracks,
                time: this.time,
                trip: tripLines({
                    trip: tripInfo(session, track.finishS - vehicle.s),
                    readings,
                    digital: this.digital,
                    gearLabel: gearLabel(car, telemetry.gear),
                }),
            },
            vehicles: this.traffic.vehicles,
            time: this.time,
            outside: this.outside,
        };
    }

    _overlays(ctx) {
        const { session } = this;
        if (this.stageTime < INTRO_SECONDS && this.state === 'driving') {
            drawStageIntro(
                ctx,
                session.stage,
                session.stageIndex + 1,
                STAGES.length,
                this.stageTime,
                INTRO_SECONDS,
                this.input.touch,
            );
        }
        if (this.toast && this.toast.time < TOAST_SECONDS) {
            drawToast(ctx, this.toast.text, (TOAST_SECONDS - this.toast.time) * 2, this.toast.color);
        }
        if (this.state === 'driving' && this.vehicle.engine.overRevTime > 0) {
            drawToast(ctx, t('drive.engineWarning'), 1, COLORS.danger);
        } else if (this.state === 'driving' && this.shiftHint) {
            drawToast(ctx, t(inputKey('drive.shiftUp', this.input.touch)), 1, COLORS.accent);
        }
        if (this.state === 'crashed')
            drawCrash(ctx, this.cause, this._fallStats(), session.chances, this.over, this.time, this.input.touch);
        if (this.state === 'ticket') drawTicket(ctx, this.car, this.clockedMph, this.time, this.input.touch);
        if (this.state === 'arrested') drawArrest(ctx, this.time, this.input.touch);
        const telemetry = this.vehicle.telemetry();
        const gear = gearLabel(this.car, telemetry.gear);
        if (this.outside && !this.view?.spectator) drawMirrorFrame(ctx);
        if (this.outside) {
            drawOutsideReadout(ctx, {
                mph: telemetry.mph, rpm: telemetry.rpm, rev: revState(telemetry, this.car), gear, psi: boostPsi(telemetry, this.car),
            });
        } else drawGear(ctx, gear);
        if (this.paused) drawPaused(ctx);
    }

    /** The numbers of a fall over the edge (and into the sea) for the crash notice, or null. */
    _fallStats() {
        const w = this.wreck;
        if (this.cause !== CRASH_CAUSE.edge || !w) return null;
        if (w.sank > 0) {
            return t('crash.intoTheSea', {
                ft: Math.round((w.startHeight - this.landscape.waterLevel) / PHYS.foot),
                depth: Math.round(w.sank / PHYS.foot),
            });
        }
        return t('crash.fallStats', {
            ft: Math.round(w.drop / PHYS.foot),
            s: w.time.toFixed(1),
            mph: Math.round(w.hardestHit / PHYS.mph),
        });
    }
}
