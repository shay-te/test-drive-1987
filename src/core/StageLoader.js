import { STAGES } from '../data/stages.js';
import { layOutStage, restoreStage } from '../sim/stageData.js';

/** Prepares stages ahead of time: each stage's road and ground laid out by `layOut(index)` (a worker in
 *  the browser) while everything the world shows of it downloads, so a stage that is about to start
 *  waits only for work already under way. */
export class StageLoader {
    constructor(world, layOut) {
        this.world = world;
        this.layOut = layOut;
        this.jobs = new Map();
    }

    /** Starts preparing stage `index`, once; resolves to its { stage, track, landscape }. */
    prepare(index) {
        if (!this.jobs.has(index)) {
            const job = Promise.all([this.layOut(index), this.world.prepareStage(STAGES[index])]).then(([laid]) => {
                return restoreStage(laid);
            });
            // A failed stage is prepared afresh when it is asked for again.
            job.catch(() => { this.jobs.delete(index); });
            this.jobs.set(index, job);
        }
        return this.jobs.get(index);
    }

    /** Lets go of every prepared stage except those `kept`. */
    keep(...kept) {
        for (const index of this.jobs.keys()) if (!kept.includes(index)) this.jobs.delete(index);
    }
}

/** How stages get laid out: in a module worker at `url` (src/sim/stageWorker.js), off the main thread;
 *  on the main thread a turn later where no module worker can start (old browsers), or with no `url`
 *  (the Node tests). Resolves `index` to laid-out stage data. */
export function stageLayout(url) {
    if (url) {
        try {
            return inWorker(new Worker(url, { type: 'module' }));
        } catch (error) {
            console.warn('[stages] no module worker here: stages are laid out on the main thread', error);
        }
    }
    return (index) => {
        return Promise.resolve().then(() => { return layOutStage(index); });
    };
}

/** Lays stages out in `worker`, one message per stage. */
function inWorker(worker) {
    const waiting = new Map();
    worker.onmessage = ({ data }) => {
        const job = waiting.get(data.index);
        waiting.delete(data.index);
        if (data.error) job.reject(new Error(`Laying out stage ${data.index + 1} failed: ${data.error}`));
        else job.resolve(data);
    };
    worker.onerror = (event) => {
        console.error('[stages] the stage worker failed', event);
        for (const job of waiting.values()) job.reject(new Error('The stage worker failed'));
        waiting.clear();
    };
    return (index) => {
        return new Promise((resolve, reject) => {
            waiting.set(index, { resolve, reject });
            worker.postMessage({ index });
        });
    };
}
