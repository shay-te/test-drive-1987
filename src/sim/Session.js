import { GAME, PHYS, POLICE } from '../config.js';
import { STAGES } from '../data/stages.js';

/** Points per stage: average mph squared times stage km, scaled. */
const POINTS_SCALE = 0.1;
const CHANCE_BONUS = 2500;

export const CRASH_CAUSE = Object.freeze({
    wall: 'wall',
    rail: 'rail',
    edge: 'edge',
    headOn: 'headOn',
    rearEnd: 'rearEnd',
    reversing: 'reversing',
    police: 'police',
    engine: 'engine',
});

/** Game rules of one run: stage clock, chances, tickets, crashes and the score sheet. */
export class Session {
    constructor(car) {
        this.car = car;
        this.stageIndex = 0;
        this.chances = GAME.chances;
        this.results = [];
        this.over = false;
        this.stageTime = 0;
        this.penalty = 0;
        this.tickets = 0;
        this.crashes = 0;
        this.arrested = false;
    }

    get stage() {
        return STAGES[this.stageIndex];
    }

    get isLastStage() {
        return this.stageIndex === STAGES.length - 1;
    }

    get totalScore() {
        return this.results.reduce((sum, r) => {
            return sum + r.points;
        }, 0);
    }

    get totalTime() {
        return this.results.reduce((sum, r) => {
            return sum + r.time;
        }, 0);
    }

    beginStage() {
        this.stageTime = 0;
        this.penalty = 0;
        this.tickets = 0;
        this.crashes = 0;
    }

    tick(dt) {
        this.stageTime += dt;
    }

    get elapsed() {
        return this.stageTime + this.penalty;
    }

    /** Uses up a chance; ramming a patrol car ends the run outright. */
    recordCrash(cause) {
        this.crashes++;
        this.chances = Math.max(0, this.chances - 1);
        if (cause === CRASH_CAUSE.police || this.chances === 0) this.over = true;
        return this.over;
    }

    /** A roadside speeding ticket: the time it takes to be written, and on the record. */
    recordTicket() {
        this.tickets++;
        this.penalty += POLICE.ticketSeconds;
    }

    /** Arrested for failing to stop for the police: jail, and the run is over. */
    recordArrest() {
        this.arrested = true;
        this.over = true;
    }

    /** Closes the stage at the gas station and returns its score line. */
    finishStage(distance) {
        const time = this.elapsed;
        const avgMph = distance / time / PHYS.mph;
        const points = Math.round(avgMph * avgMph * (distance / 1000) * POINTS_SCALE);
        const result = {
            stage: this.stageIndex,
            time,
            avgMph,
            points,
            tickets: this.tickets,
            crashes: this.crashes,
        };
        this.results.push(result);
        if (this.isLastStage) {
            this.over = true;
            this.bonus = this.chances * CHANCE_BONUS;
        }
        return result;
    }

    advance() {
        this.stageIndex++;
    }

    get finalScore() {
        return this.totalScore + (this.bonus ?? 0);
    }
}
