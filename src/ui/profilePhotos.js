/** Asks `world` for `car`'s side-on photo, if it has a model; `onPhoto(photo)` runs once it is ready.
 *  A failed photo leaves the car on its drawn artwork, and says so. */
export function requestProfilePhoto(world, car, onPhoto) {
    world.profile(car)?.then(onPhoto).catch((error) => {
        console.error(`Profile photo failed for ${car.id}; using profile artwork`, error);
    });
}
