import { CARS } from '../data/cars.js';

/** Asks `world` for the side-on photo of every car with a model; `onPhoto(car, photo)` runs as each
 *  arrives. A failed photo leaves that car on its drawn artwork, and says so. */
export function loadProfilePhotos(world, onPhoto) {
    for (const car of CARS) {
        world.profile(car)?.then((photo) => {
            onPhoto(car, photo);
        }).catch((error) => {
            console.error(`Profile photo failed for ${car.id}; using profile artwork`, error);
        });
    }
}
