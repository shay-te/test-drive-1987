import { VIEW } from '../config.js';

const ASPECT = VIEW.width / VIEW.height;
/** Backing-store width cap: sharp on 4K without burning fill rate. */
const MAX_BACKING_WIDTH = 2560;
/** Phones of 3x density get 2x: sharp, without drawing nine pixels for every one shown. */
const MAX_PIXEL_RATIO = 2;

/** The 16:10 letterboxed stage: a WebGL canvas for the world under a 2D canvas for the rest. */
export class Display {
    constructor(container) {
        this.container = container;
        this.glCanvas = this._createCanvas('world');
        this.uiCanvas = this._createCanvas('overlay');
        this.ctx = this.uiCanvas.getContext('2d');
        this.scale = 1;
        this.resizeListeners = new Set();
        new ResizeObserver(() => {
            this._resize();
        }).observe(container);
        this._resize();
    }

    _createCanvas(className) {
        const canvas = document.createElement('canvas');
        canvas.className = className;
        this.container.appendChild(canvas);
        return canvas;
    }

    /** Called with the new pixel scale whenever the backing resolution changes. */
    onResize(listener) {
        this.resizeListeners.add(listener);
    }

    _resize() {
        const { clientWidth, clientHeight } = this.container;
        const cssWidth = Math.min(clientWidth, clientHeight * ASPECT);
        const cssHeight = cssWidth / ASPECT;
        const backingWidth = Math.min(
            MAX_BACKING_WIDTH,
            Math.round(cssWidth * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)),
        );
        const scale = backingWidth / VIEW.width;
        for (const canvas of [this.glCanvas, this.uiCanvas]) {
            canvas.style.width = `${cssWidth}px`;
            canvas.style.height = `${cssHeight}px`;
            canvas.style.left = `${(clientWidth - cssWidth) / 2}px`;
            canvas.style.top = `${(clientHeight - cssHeight) / 2}px`;
        }
        if (scale === this.scale && this.uiCanvas.width === backingWidth) return;
        // Assigning a canvas size clears it, so only do it when the size really changed.
        this.uiCanvas.width = backingWidth;
        this.uiCanvas.height = Math.round(VIEW.height * scale);
        this.scale = scale;
        for (const listener of this.resizeListeners) listener(scale);
    }

    /** Clears the overlay and maps logical 1280x800 coordinates onto it. */
    beginFrame() {
        const { ctx } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    }

    /** Converts a client (mouse/touch) position to logical coordinates. */
    toLogical(clientX, clientY) {
        const rect = this.uiCanvas.getBoundingClientRect();
        return {
            x: ((clientX - rect.left) / rect.width) * VIEW.width,
            y: ((clientY - rect.top) / rect.height) * VIEW.height,
        };
    }
}
