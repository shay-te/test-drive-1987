/** Resolution of side-on model photos: sharp at the title's car width on a 2x display. */
const PIXELS_PER_METRE = 360;
/** Clear space above the roof (or aerial) so nothing touches the top edge, in metres. */
const HEADROOM = 0.03;

/** Orthographic side-on framing of a model's bounds seen from its left: nose on the left edge, tail
 *  on the right, the road on the bottom edge. Extents are camera-space metres; width/height pixels. */
export function profileFrame(min, max) {
    const top = max.y + HEADROOM;
    return {
        left: min.z,
        right: max.z,
        top,
        bottom: 0,
        width: Math.round((max.z - min.z) * PIXELS_PER_METRE),
        height: Math.round(top * PIXELS_PER_METRE),
    };
}
