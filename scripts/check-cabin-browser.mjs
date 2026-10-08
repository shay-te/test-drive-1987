import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

async function instance(page, path, name) {
    const session = await page.context().newCDPSession(page);
    const { result } = await session.send('Runtime.evaluate', {
        expression: `import(${JSON.stringify(path)}).then(function(module) { return module[${JSON.stringify(name)}].prototype; })`,
        awaitPromise: true,
    });
    const { objects } = await session.send('Runtime.queryObjects', { prototypeObjectId: result.objectId });
    await session.send('Runtime.callFunctionOn', {
        objectId: objects.objectId,
        functionDeclaration: 'function() { globalThis.__cabinInspection = this[0]; }',
    });
    const handle = await page.evaluateHandle(() => { return globalThis.__cabinInspection; });
    await session.detach();
    return handle;
}

async function measure(page, screen) {
    return page.evaluate(async (value) => {
        const renderer = value.world.renderer;
        const reset = renderer.info.autoReset;
        renderer.info.autoReset = false;
        const samples = [];
        let previous = performance.now();
        for (let i = 0; i < 30; i++) {
            renderer.info.reset();
            await new Promise((resolve) => { requestAnimationFrame(resolve); });
            const now = performance.now();
            samples.push(now - previous);
            previous = now;
        }
        samples.sort((a, b) => { return a - b; });
        const result = {
            frameIntervalMedianMs: samples[Math.floor(samples.length / 2)],
            callsAllPasses: renderer.info.render.calls,
            trianglesAllPasses: renderer.info.render.triangles,
            textures: renderer.info.memory.textures,
            geometries: renderer.info.memory.geometries,
            width: renderer.domElement.width,
            height: renderer.domElement.height,
        };
        renderer.info.autoReset = reset;
        return result;
    }, screen);
}

async function lighting(page, screen, stageIndex) {
    await page.evaluate(async ({ preview, index }) => {
        const { STAGES } = await import('/src/data/stages.js');
        preview.stage = STAGES[index];
        preview.world.loadPreview(preview.stage, preview.car, await preview.world.prepare(preview.car));
    }, { preview: screen, index: stageIndex });
}

async function confirmLoading(browser, label, userAgent) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, userAgent });
    const failures = [];
    page.on('pageerror', (error) => { failures.push(error.message); });
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) failures.push(message.text());
    });
    page.on('requestfailed', (request) => { failures.push(`${request.url()}: ${request.failure().errorText}`); });
    await page.addInitScript(() => {
        globalThis.__cabinDrawCalls = 0;
        const draw = globalThis.WebGL2RenderingContext.prototype.drawElements;
        globalThis.WebGL2RenderingContext.prototype.drawElements = function (...args) {
            globalThis.__cabinDrawCalls++;
            return draw.apply(this, args);
        };
    });
    try {
        await page.goto(baseUrl);
        await page.waitForFunction(() => {
            const canvas = document.querySelector('canvas.overlay');
            return canvas && canvas.getContext('2d').getImageData(640, 150, 1, 1).data[3] > 0;
        });
        await page.keyboard.press('Enter');
        await page.evaluate(async () => {
            await new Promise((resolve) => { requestAnimationFrame(resolve); });
            await new Promise((resolve) => { requestAnimationFrame(resolve); });
        });
        const asset = page.waitForResponse((response) => { return response.url().endsWith('/cabin.glb'); });
        await page.keyboard.press('Enter');
        assert.equal((await asset).status(), 200, `${label}: actual cabin download`);
        await page.waitForFunction(() => { return globalThis.__cabinDrawCalls > 0; });
        assert.deepEqual(failures, [], `${label}: browser errors`);
        await page.screenshot({ path: `${output}/${label}-driving.png` });
        return { userAgent: await page.evaluate(() => { return navigator.userAgent; }), rendered: true, errors: failures };
    } catch (error) {
        await page.screenshot({ path: `${output}/${label}-failed.png` });
        throw new Error(`${label}: ${error.message}; console: ${failures.join('; ')}`, { cause: error });
    } finally {
        await page.close();
    }
}

const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const baseUrl = process.env.GAME_URL ?? 'http://127.0.0.1:8080';
const output = process.env.CABIN_EVIDENCE ?? '/tmp/test-drive-cabin-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.BROWSER_BIN,
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const consoleErrors = [];
let expectedAssetFailure = false;
let expectedAssetErrors = 0;
const results = {};
try {
    if (!process.env.CABIN_REGRESSION_ONLY) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
        page.on('pageerror', (error) => { errors.push(error.message); });
        page.on('console', (message) => {
            if (message.type() !== 'error' || message.location().url.endsWith('/favicon.ico')) return;
            if (expectedAssetFailure && message.text().includes('503')) {
                if (message.text().startsWith('[preview] Cabin preparation failed')) {
                    expectedAssetErrors++;
                    return;
                }
                if (message.location().url.endsWith('/cabin.glb')) return;
            }
            consoleErrors.push(message.text());
        });
        let modelRequests = 0;
        page.on('request', (request) => {
            if (request.url().endsWith('/cabin.glb')) modelRequests++;
        });
        await page.goto(`${baseUrl}/preview.html`, { waitUntil: 'networkidle' });
        const screen = await instance(page, '/src/ui/screens/PreviewScreen.js', 'PreviewScreen');
        await page.waitForFunction((preview) => { return preview.ready; }, screen);
        await page.keyboard.down('ArrowLeft');
        await page.waitForFunction((preview) => {
            return Math.abs(preview.world.cabin.bindings.steering_wheel.quaternion.z) > 0.1;
        }, screen);
        await page.keyboard.up('ArrowLeft');
        await page.keyboard.press('A');
        await page.waitForFunction((preview) => { return preview.vehicle.engine.gear === 1; }, screen);
        await page.keyboard.press('8');
        await page.waitForFunction((preview) => {
            return preview.world.cabin.leds.some((led) => { return led.material.emissiveIntensity > 0; });
        }, screen);
        await page.keyboard.press('9');
        await page.waitForFunction((preview) => { return preview.world.cabin.windshield.mesh.visible; }, screen);
        await page.keyboard.press('8');
        await page.keyboard.press('9');
        const { CABIN_VIEWS } = await import('../src/data/cabinViews.js');
        for (const stageIndex of [0, 4]) {
            await lighting(page, screen, stageIndex);
            const prefix = stageIndex === 0 ? '' : 'sunset-';
            for (const [i, view] of CABIN_VIEWS.entries()) {
                await page.keyboard.press(`Digit${i + 1}`);
                await page.waitForFunction(({ preview, yaw, pitch }) => {
                    return Math.abs(preview.head.yaw.value + yaw) < 0.01 && Math.abs(preview.head.pitch.value - pitch) < 0.01;
                }, { preview: screen, yaw: view.yaw, pitch: view.pitch });
                await page.screenshot({ path: `${output}/${prefix}${view.id}.png` });
            }
        }
        await lighting(page, screen, 0);
        await page.keyboard.press('C');
        await page.mouse.move(600, 400);
        await page.mouse.down();
        await page.mouse.move(750, 350);
        await page.mouse.up();
        await page.waitForFunction((preview) => { return preview.head.lookYaw > 0.5 && preview.head.lookPitch > 0.1; }, screen);
        await page.keyboard.press('C');
        await page.waitForFunction((preview) => { return Math.abs(preview.head.yaw.value) < 0.01; }, screen);
        const touch = await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 600, y: 400 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 750, y: 350 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.detach();
        await page.waitForFunction((preview) => { return preview.head.lookYaw > 0.5 && preview.head.lookPitch > 0.1; }, screen);
        await page.keyboard.press('C');
        results.preview = await page.evaluate(async (preview) => {
            const world = preview.world;
            const template = await world.prepare(preview.car);
            let disposed = false;
            const geometry = template.getObjectByName('instrument_surface').geometry;
            geometry.addEventListener('dispose', () => { disposed = true; });
            for (let i = 0; i < 3; i++) world.loadPreview(preview.stage, preview.car, await world.prepare(preview.car));
            if (disposed) throw new Error('Cabin teardown disposed cached geometry');
            const { AssetCabin } = await import('/src/world/cabin/AssetCabin.js');
            if (!(world.cabin instanceof AssetCabin)) throw new Error('Porsche does not use its authored asset');
            const cluster = world.cabin.displays.clusterTexture;
            if (cluster.flipY) throw new Error('GLB instruments have the wrong texture orientation');
            const direction = world.mirrorCamera.getWorldDirection(world.sun.position.clone());
            if (direction.z < 0.9) throw new Error('Mirror camera is not facing backwards');
            if (!world.cabin.bindings.mirror_surface.material.toneMapped) throw new Error('HDR mirror must use the final display tone mapping');
            if (world.scene.environment !== world.environmentTarget.texture) throw new Error('Stage reflection texture is missing');
            let paint;
            template.traverse((node) => {
                if (node.material?.name.includes('seafoam')) paint = node.material;
            });
            if (!paint?.isMeshPhysicalMaterial || paint.clearcoat < 0.8 || paint.metalness !== 0) throw new Error('Paint lost its dielectric clearcoat');
            return { geometrySurvivedReload: !disposed, mirrorToneMapped: true, clearcoat: paint.clearcoat,
                environmentIntensity: world.scene.environmentIntensity,
                textures: world.renderer.info.memory.textures, geometries: world.renderer.info.memory.geometries };
        }, screen);
        assert.equal(modelRequests, 1, 'the asset must only be fetched once across reloads');
        results.preview.modelRequests = modelRequests;
        results.preview.performance = await measure(page, screen);
        await page.goto(`${baseUrl}/preview.html?car=ferrari`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: `${output}/procedural-ferrari.png` });
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        const game = await instance(page, '/src/core/Game.js', 'Game');
        await page.keyboard.press('Enter');
        await page.waitForFunction((value) => { return value.screen.constructor.name === 'SelectScreen'; }, game);
        await page.waitForFunction((value) => { return value.screen.artwork.has('porsche'); }, game);
        results.selection = await page.evaluate((value) => {
            const screen = value.screen;
            const image = screen.artwork.get('porsche');
            if (image !== screen.resources.get(`image:${screen.car.brochure.image}`)) throw new Error('Brochure render is not cached');
            return { width: image.naturalWidth, height: image.naturalHeight, path: screen.car.brochure.image };
        }, game);
        await page.screenshot({ path: `${output}/selection-porsche.png` });
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction((value) => { return value.screen.car.id !== 'porsche'; }, game);
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction((value) => { return value.screen.car.id === 'porsche'; }, game);
        await page.keyboard.press('Enter');
        await page.waitForFunction((value) => { return value.screen.state === 'driving'; }, game);
        const drive = await page.evaluateHandle((value) => { return value.screen; }, game);
        await page.keyboard.down('ArrowUp');
        await page.waitForFunction((value) => { return value.vehicle.speedMph > 10; }, drive);
        await page.keyboard.up('ArrowUp');
        await page.keyboard.press('P');
        await page.screenshot({ path: `${output}/driving-forward.png` });
        const pausedS = await page.evaluate((value) => { return value.vehicle.s; }, drive);
        await page.keyboard.press('Digit7');
        await page.waitForFunction((value) => { return value.head.yaw.value < -2; }, drive);
        const stoppedS = await page.evaluate((value) => { return value.vehicle.s; }, drive);
        assert.equal(stoppedS, pausedS, 'look-around while paused must not move the vehicle');
        await page.screenshot({ path: `${output}/driving-paused-rear.png` });
        results.driving = await page.evaluate((value) => {
            return { speedMph: value.vehicle.speedMph, paused: value.paused, yaw: value.head.yaw.value };
        }, drive);
        results.driving.performance = await measure(page, drive);
        expectedAssetFailure = true;
        let attempts = 0;
        await page.route('**/cabin.glb', async (route) => {
            if (attempts++ === 0) {
                await route.fulfill({ status: 503, headers: { 'cache-control': 'no-store' }, body: 'unavailable' });
            } else await route.continue();
        });
        await page.goto(`${baseUrl}/preview.html`, { waitUntil: 'domcontentloaded' });
        const retry = await instance(page, '/src/ui/screens/PreviewScreen.js', 'PreviewScreen');
        await page.waitForFunction((value) => { return value.failed && !value.ready; }, retry);
        await page.keyboard.press('Enter');
        await page.waitForFunction((value) => { return value.ready; }, retry);
        assert.equal(attempts, 2, 'a failed configured asset must retry rather than fall back');
        assert.equal(expectedAssetErrors, 1, 'only the deliberately failed download may log a preparation error');
        results.failedAssetRetry = true;
        assert.deepEqual(errors, [], 'browser exceptions');
        assert.deepEqual(consoleErrors, [], 'unexpected console errors, including caught loading failures');
        results.totalModelRequests = modelRequests;
        await page.close();
    }
    results.userAgents = {};
    for (const userAgent of ['Firefox', 'Mozilla/5.0 Firefox/140', 'Mozilla/5.0 Firefox/140.0']) {
        const label = userAgent.replaceAll(/[^a-zA-Z0-9]+/g, '-');
        results.userAgents[label] = await confirmLoading(browser, label, userAgent);
    }
} finally {
    await browser.close();
}
const firefoxBrowser = await firefox.launch({
    headless: true,
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'gfx.webrender.software': true },
});
try {
    results.firefox = await confirmLoading(firefoxBrowser, 'firefox', undefined);
} finally {
    await firefoxBrowser.close();
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 4) + '\n');
console.info(JSON.stringify(results));
