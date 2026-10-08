/** Loads, generates and caches every asset: fonts, procedural canvases, audio buffers and JSON. */
export class ResourceManager {
    constructor(baseUrl = new URL('../../', import.meta.url)) {
        this.baseUrl = baseUrl;
        this.cache = new Map();
        this.pending = new Map();
    }

    url(path) {
        return new URL(path, this.baseUrl).href;
    }

    has(key) {
        return this.cache.has(key);
    }

    get(key) {
        if (!this.cache.has(key)) throw new Error(`Resource "${key}" has not been loaded`);
        return this.cache.get(key);
    }

    /** Returns the cached value for `key`, creating it with `factory` the first time. */
    memo(key, factory) {
        if (!this.cache.has(key)) this.cache.set(key, factory());
        return this.cache.get(key);
    }

    /** A cached offscreen canvas drawn once by `draw(ctx, width, height)`. */
    canvas(key, width, height, draw) {
        return this.memo(`canvas:${key}`, () => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width));
            canvas.height = Math.max(1, Math.round(height));
            draw(canvas.getContext('2d'), canvas.width, canvas.height);
            return canvas;
        });
    }

    /** Like `canvas`, but `paint` works in logical units on a canvas `scale` times larger. */
    scaledCanvas(key, width, height, scale, paint) {
        return this.canvas(`${key}@${scale}`, width * scale, height * scale, (ctx) => {
            ctx.scale(scale, scale);
            paint(ctx);
        });
    }

    /** Drops cached canvases whose key starts with `prefix` (e.g. after a resize). */
    evict(prefix) {
        for (const key of [...this.cache.keys()]) {
            if (key.startsWith(prefix)) this.cache.delete(key);
        }
    }

    /** Loads `path` once; concurrent callers share the same promise. */
    _load(key, loader) {
        if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
        if (!this.pending.has(key)) {
            const promise = loader().then((value) => {
                this.cache.set(key, value);
                return value;
            }).finally(() => {
                this.pending.delete(key);
            });
            this.pending.set(key, promise);
        }
        return this.pending.get(key);
    }

    /** Caches a loaded model while leaving format decoding to the renderer's loader. */
    model(path, loader) {
        return this._load(`model:${path}`, () => {
            return loader(this.url(path));
        });
    }

    font(family, descriptor = '16px') {
        return this._load(`font:${family}:${descriptor}`, async () => {
            await document.fonts.load(`${descriptor} "${family}"`);
            return family;
        });
    }

    json(path) {
        return this._load(`json:${path}`, async () => {
            return (await this._fetch(path)).json();
        });
    }

    audioBuffer(context, path) {
        return this._load(`audio:${path}`, async () => {
            return context.decodeAudioData(await (await this._fetch(path)).arrayBuffer());
        });
    }

    async _fetch(path) {
        const response = await fetch(this.url(path));
        if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
        return response;
    }

    /** Runs loader tasks in parallel, reporting progress as 0..1. */
    async preload(tasks, onProgress = () => {}) {
        let done = 0;
        onProgress(0);
        await Promise.all(
            tasks.map(async (task) => {
                await task();
                onProgress(++done / tasks.length);
            }),
        );
    }
}
