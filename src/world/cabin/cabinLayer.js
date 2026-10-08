/** Render layer of the cabin: drawn in its own pass after the world, with its own lights. */
export const CABIN_LAYER = 1;

/** Puts every object under `root` on the cabin layer. */
export function onCabinLayer(root) {
    root.traverse((object) => {
        object.layers.set(CABIN_LAYER);
    });
    return root;
}
