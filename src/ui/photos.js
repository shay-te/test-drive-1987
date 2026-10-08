/** Runs `onPhoto` once `photo` (a promise of a canvas, or null when there is nothing to photograph) is
 *  ready. A failed photo leaves the drawn artwork in place, and says so. */
export function whenPhotographed(photo, what, onPhoto) {
    photo?.then(onPhoto).catch((error) => {
        console.error(`Photo of ${what} failed; using the drawn artwork`, error);
    });
}
