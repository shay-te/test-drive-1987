import { CockpitState } from '../../cockpit/CockpitState.js';
import { HeadMotion } from '../../cockpit/HeadMotion.js';
import { instrumentReadings, lampStates } from '../../cockpit/instruments.js';
import { tripInfo, tripLines } from '../../cockpit/tripDisplay.js';
import { PREVIEW, VIEW } from '../../config.js';
import { CABIN_VIEWS } from '../../data/cabinViews.js';
import { carById, gearLabel } from '../../data/cars.js';
import { STAGES } from '../../data/stages.js';
import { t } from '../../i18n/i18n.js';
import { Session } from '../../sim/Session.js';
import { VehicleDynamics } from '../../sim/VehicleDynamics.js';
import { drawLoading } from '../driveOverlays.js';
import { COLORS } from '../theme.js';
import { drawText } from '../widgets.js';

const ORIGIN = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };

/** Inspects cabin assets with the actual renderer, instruments, animation, and seated camera. */
export class PreviewScreen {
    constructor({ input, world }) {
        this.input = input;
        this.world = world;
        this.time = 0;
        this.ready = false;
        this.failed = false;
        this.radar = false;
        this.crack = null;
    }

    enter() {
        const params = new URL(location.href).searchParams;
        this.car = carById(params.get('car'));
        this.stage = STAGES[Number(params.get('stage'))] ?? STAGES[0];
        this.session = new Session(this.car);
        this.session.stageIndex = STAGES.indexOf(this.stage);
        this.vehicle = new VehicleDynamics(this.car);
        this.cockpit = new CockpitState(this.car);
        this.head = new HeadMotion();
        this.input.setLookEnabled(true);
        const view = CABIN_VIEWS.find((item) => { return item.id === params.get('view'); });
        if (view) this.head.update(0, this.vehicle.telemetry(), { view });
        this._prepare();
    }

    _prepare() {
        this.failed = false;
        Promise.resolve(this.world.prepareCabin(this.car)).then((asset) => {
            this.world.loadPreview(this.stage, this.car, asset);
            this.ready = true;
        }).catch((error) => {
            console.error('[preview] Cabin preparation failed', error);
            this.failed = true;
        });
    }

    update(dt) {
        this.time += dt;
        if (!this.ready) {
            if (this.failed && this.input.pressed('confirm')) this._prepare();
            return;
        }
        const { engine, drivetrain } = this.vehicle;
        if (this.input.pressed('shiftUp')) drivetrain.shift(engine, 1);
        if (this.input.pressed('shiftDown')) drivetrain.shift(engine, -1);
        drivetrain.update(engine, 0, this.input.throttle(), dt);
        if (this.input.pressed('previewRadar')) this.radar = !this.radar;
        if (this.input.pressed('previewCrack')) this.crack = this.crack ? null : PREVIEW.crack;
        const telemetry = this.vehicle.telemetry();
        const readings = instrumentReadings(telemetry, this.car);
        this.cockpit.update(dt, readings, telemetry.gear);
        this.view = {
            pose: ORIGIN,
            head: this.head.update(dt, telemetry, this.input.look()),
            vehicles: [],
            time: this.time,
            cockpit: {
                state: this.cockpit, readings,
                lamps: lampStates(telemetry, this.car, this.time),
                trip: tripLines({ trip: tripInfo(this.session, 0), readings, digital: true, gearLabel: gearLabel(this.car, engine.gear) }),
                steer: this.input.steering(),
                radar: this.radar ? PREVIEW.radar : 0,
                crack: this.crack,
                time: this.time,
            },
        };
    }

    render(ctx) {
        if (!this.ready) {
            drawLoading(ctx, this.time, this.failed, 'preview.assetRetry');
            return;
        }
        this.world.render(this.view);
        const options = { size: 16, color: COLORS.chrome };
        drawText(ctx, t('preview.title', { car: this.car.fullName }), VIEW.width / 2, PREVIEW.titleY, options);
        drawText(ctx, t('preview.controls'), VIEW.width / 2, PREVIEW.hintsY, options);
        CABIN_VIEWS.forEach((view, i) => {
            drawText(ctx, `${i + 1}: ${t(view.label)}`, VIEW.width / 2 + (i - (CABIN_VIEWS.length - 1) / 2) * PREVIEW.viewSpacing, PREVIEW.viewsY, options);
        });
    }
}
