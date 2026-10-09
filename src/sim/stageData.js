import { STAGES } from '../data/stages.js';
import { Landscape } from './Landscape.js';
import { Track } from './Track.js';
import { buildTrack } from './TrackBuilder.js';

/** Stage `index` laid out (its track and the ground around it) as plain data that can be sent from a
 *  worker to the main thread. */
export function layOutStage(index) {
    const stage = STAGES[index];
    const track = buildTrack(stage);
    return { index, track: track.prepared, landscape: new Landscape(track, stage).prepared };
}

/** The stage, Track and Landscape from laid-out stage data, without working them out again. */
export function restoreStage({ index, track, landscape }) {
    const stage = STAGES[index];
    const restored = new Track({ ...track, stage });
    return { stage, track: restored, landscape: new Landscape(restored, stage, landscape) };
}

/** The buffers of laid-out stage data's typed arrays, to hand over to another thread rather than copy. */
export function transferables(data) {
    const arrays = [...Object.values(data.track), ...Object.values(data.landscape)].filter((value) => {
        return ArrayBuffer.isView(value);
    });
    return [...new Set(arrays.map((array) => { return array.buffer; }))];
}
