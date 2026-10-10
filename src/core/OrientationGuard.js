import { t } from '../i18n/i18n.js';

/** Keeps a touch screen in landscape: the first tap goes fullscreen and locks the orientation (where
 *  the browser can), and the stylesheet covers a portrait screen with a request to turn the phone. */
export class OrientationGuard {
    constructor(root) {
        this.notice = document.createElement('div');
        this.notice.id = 'rotate-notice';
        this.notice.textContent = t('orientation.rotate');
        root.appendChild(this.notice);
        if (!globalThis.matchMedia?.('(pointer: coarse)').matches) return;
        window.addEventListener('pointerdown', () => {
            this._lock();
        }, { once: true });
    }

    /** Fullscreen is what lets Android Chrome lock the orientation; iOS Safari allows neither, and the
     *  notice then asks for the turn. */
    async _lock() {
        try {
            await document.documentElement.requestFullscreen?.();
            await window.screen.orientation?.lock?.('landscape');
        } catch (error) {
            console.warn('Cannot lock the screen to landscape here; the notice asks for the turn.', error);
        }
    }
}
