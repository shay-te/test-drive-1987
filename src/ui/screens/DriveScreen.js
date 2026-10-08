import { DriveSoundscape } from '../../audio/DriveSoundscape.js';
import { CockpitState } from '../../cockpit/CockpitState.js';
import { HeadMotion } from '../../cockpit/HeadMotion.js';
import { instrumentReadings, lampStates } from '../../cockpit/instruments.js';
import { tripLines } from '../../cockpit/tripDisplay.js';
import { GAME, MOTION, PHYS } from '../../config.js';
import { gearLabel } from '../../data/cars.js';
import { STAGES } from '../../data/stages.js';
import { t } from '../../i18n/i18n.js';
import { POLICE_EVENT, PoliceManager } from '../../sim/Police.js';
import { CRASH_CAUSE } from '../../sim/Session.js';
import { buildTrack } from '../../sim/TrackBuilder.js';
import { LANE, ONCOMING, TrafficManager } from '../../sim/Traffic.js';
import { VehicleDynamics } from '../../sim/VehicleDynamics.js';
import { approach } from '../../util/math.js';
import {
    drawCrash,
    drawLoading,
    drawPaused,
    drawStageIntro,
    drawTicket,
    drawToast,
} from '../driveOverlays.js';
import { COLORS } from '../theme.js';

const STEP = 1 / GAME.physicsHz;
const INTRO_SECONDS = 4;
const TOAST_SECONDS = 3;
/** Going over the edge: how long the fall plays before the crash notice. */
const FALL_SECONDS = 2.2;
const FALL_DRIFT = 4;
/** After a crash the car restarts this far back, in the right-hand lane. */
const RESPAWN_BACK = 25;
/** Fuel gauge drop over a full stage (cosmetic). */
const FUEL_USED = 0.6;
/** Impacts above this speed (m/s) crack the windshield. */
const CRACK_IMPACT = 6;
const TICKET_BRAKE = 1;
/** Where on the glass an impact can crack it (layout px), the fall's tilt per second, body sway rate. */
const CRACK_AREA = { x: 380, y: 120, w: 520, h: 220 };
const FALL_PITCH = 0.35;
const FALL_ROLL = 0.4;
const BODY_RATE = 6;

/** One stage of driving: physics, traffic, police and the rules, seen from the driver's seat. */
export class DriveScreen {
    constructor({ game, audio, input, world }) {
        Object.assign(this, { game, audio, input, world });
        this.state = 'loading';
        this.loadingShown = false;
        this.time = 0;
        this.paused = false;
        this.digital = false;
        this.toast = null;
        this.shiftHint = false;
        this.soundscape = null;
    }

    enter({ session }) {
        this.session = session;
        this.car = session.car;
        session.beginStage();
    }

    exit() {
        this.soundscape?.stop();
        this.soundscape = null;
    }

    /** Builds the stage (heavy) one frame after the loading notice has been shown. */
    _load() {
        const { car, session } = this;
        this.track = buildTrack(session.stage);
        this.world.load(this.track, session.stage, car);
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
        this.crack = null;
        this.fall = 0;
        this.stageTime = 0;
        if (this.audio.ready) {
            this.audio.createEngine(car).then((engine) => {
                this.soundscape = new DriveSoundscape(this.audio, engine);
            });
        }
        this.state = 'driving';
    }

    update(dt) {
        this.time += dt;
        if (this.state === 'loading') {
            // The loading notice gets a frame on screen before the heavy build starts.
            if (!this.loadingShown) return;
            this._load();
        }
        const input = this.input;
        if (input.pressed('pause') || (input.pressed('back') && !this.paused)) {
            this.paused = !this.paused;
        } else if (this.paused && input.pressed('back')) {
            this._leave('select', { carId: this.car.id });
            return;
        }
        if (input.pressed('toggleDigital')) this.digital = !this.digital;
        if (!this.paused) this._advance(dt);
        if (this.state === 'results') return;
        this.view = this._view(this.paused ? 0 : dt);
        this._sound(dt);
    }

    _advance(dt) {
        this.stageTime += dt;
        if (this.toast) this.toast.time += dt;
        if (this.state === 'driving') this._drive(dt);
        else if (this.state === 'falling') this._falling(dt);
        else if (this.state === 'ticket') this._stopForTicket(dt);
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
        if (vehicle.s >= this.track.finishS && this.state === 'driving') this._finish();
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
            this._crash(cause, Math.abs(vehicle.vx - hit.speed * hit.dir));
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
        } else if (police === POLICE_EVENT.escaped) {
            this._notice(t('drive.escaped'), COLORS.lcd);
        } else if (police === POLICE_EVENT.pulledOver) {
            this.state = 'ticket';
            this.stateTime = 0;
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

    _crash(cause, impact) {
        this.cause = cause;
        this.over = this.session.recordCrash(cause);
        this.head.jolt(impact);
        if (cause !== CRASH_CAUSE.engine && impact > CRACK_IMPACT) {
            this.crack = {
                x: CRACK_AREA.x + Math.random() * CRACK_AREA.w,
                y: CRACK_AREA.y + Math.random() * CRACK_AREA.h,
                seed: Math.floor(this.time * 1000),
            };
        }
        this.audio.play('crash', { volume: cause === CRASH_CAUSE.engine ? 0.5 : 1 });
        this.state = cause === CRASH_CAUSE.edge ? 'falling' : 'crashed';
        this.fall = 0;
    }

    /** Over the edge: the car drops away from the road, nose down, rolling towards the valley. */
    _falling(dt) {
        this.fall += dt;
        this.vehicle.u -= FALL_DRIFT * dt;
        if (this.fall >= FALL_SECONDS) this.state = 'crashed';
    }

    _afterCrash() {
        if (this.over) {
            this._leave('results', { session: this.session });
            return;
        }
        const s = Math.max(this.track.startS, this.vehicle.s - RESPAWN_BACK);
        this.vehicle.reset(s, LANE);
        this.traffic.clearAround(s);
        this.police.release();
        this.crack = null;
        this.fall = 0;
        this.state = 'driving';
    }

    /** Pulled over: the car brakes to a stop, then the citation is written. */
    _stopForTicket(dt) {
        const { vehicle } = this;
        this.stateTime += dt;
        if (vehicle.vx > 0.3) {
            vehicle.step(dt, { steer: 0, throttle: 0, brake: TICKET_BRAKE }, this.track);
            return;
        }
        if (!this.input.pressed('confirm')) return;
        const over = this.session.recordTicket();
        this.police.release();
        if (over) {
            this._leave('results', { session: this.session });
            return;
        }
        this.state = 'driving';
    }

    _finish() {
        const result = this.session.finishStage(this.track.finishS - this.track.startS);
        this._leave(this.session.over ? 'results' : 'station', { session: this.session, result });
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
        });
    }

    render(ctx) {
        if (this.state === 'loading') {
            this.world.clear();
            drawLoading(ctx, this.time);
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
        this.cockpit.update(dt, readings, telemetry.gear);
        const look = (this.input.isDown('lookRight') ? 1 : 0) - (this.input.isDown('lookLeft') ? 1 : 0);
        const head = this.head.update(dt, telemetry, look);
        const fallen =
            this.state === 'falling' || (this.state === 'crashed' && this.cause === CRASH_CAUSE.edge);
        const fall = Math.min(this.fall, FALL_SECONDS);
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
            pitch: Math.atan(track.gradeAt(vehicle.s)) + this.bodyPitch - (fallen ? fall * FALL_PITCH : 0),
            roll: this.bodyRoll + (fallen ? fall * FALL_ROLL : 0),
            lift: fallen ? -0.5 * PHYS.g * fall * fall : 0,
            head,
            cockpit: {
                state: this.cockpit,
                readings,
                lamps: lampStates(telemetry, car, this.time),
                steer: telemetry.steer,
                radar: this.police.radarSignal(vehicle),
                crack: this.crack,
                time: this.time,
                trip: tripLines({
                    trip: {
                        stage: session.stageIndex + 1,
                        total: STAGES.length,
                        elapsed: session.elapsed,
                        remaining: Math.max(0, track.finishS - vehicle.s),
                        summit: Boolean(session.stage.summit),
                        chances: session.chances,
                        maxChances: GAME.chances,
                    },
                    readings,
                    digital: this.digital,
                    gearLabel: gearLabel(car, telemetry.gear),
                }),
            },
            vehicles: this.traffic.vehicles,
            time: this.time,
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
            );
        }
        if (this.toast && this.toast.time < TOAST_SECONDS) {
            drawToast(ctx, this.toast.text, (TOAST_SECONDS - this.toast.time) * 2, this.toast.color);
        }
        if (this.state === 'driving' && this.vehicle.engine.overRevTime > 0) {
            drawToast(ctx, t('drive.engineWarning'), 1, COLORS.danger);
        } else if (this.state === 'driving' && this.shiftHint) {
            drawToast(ctx, t('drive.shiftUp'), 1, COLORS.accent);
        }
        if (this.state === 'crashed') drawCrash(ctx, this.cause, session.chances, this.over, this.time);
        if (this.state === 'ticket' && this.vehicle.vx <= 0.3)
            drawTicket(ctx, this.car, this.clockedMph, this.time);
        if (this.paused) drawPaused(ctx);
    }
}
