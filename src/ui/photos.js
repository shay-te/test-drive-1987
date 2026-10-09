/** Runs `onPhoto` once `photo` (a promise of a canvas, or null when there is nothing to photograph) is
 *  ready, with the canvas, or with null when there is none or it failed (which it says): until then
 *  the screen shows a spinner, after a null the drawn artwork. */
export function whenPhotographed(photo, what, onPhoto) {
    if (!photo) {
        onPhoto(null);
        return;
    }
    photo.then(onPhoto).catch((error) => {
        console.error(`Photo of ${what} failed; using the drawn artwork`, error);
        onPhoto(null);
    });
}
