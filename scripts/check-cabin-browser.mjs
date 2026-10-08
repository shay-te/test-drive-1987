import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

async function instance(page, path, name) {
    const prototype = await page.evaluateHandle(async (modulePath, symbol) => {
        const module = await import(modulePath);
        return module[symbol].prototype;
    }, path, name);
    const instances = await page.queryObjects(prototype);
    return page.evaluateHandle((list) => { return list[0]; }, instances);
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

const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE ?? 'puppeteer-core');
const baseUrl = process.env.GAME_URL ?? 'http://127.0.0.1:8080';
const output = process.env.CABIN_EVIDENCE ?? '/tmp/test-drive-cabin-evidence';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: process.env.BROWSER_BIN,
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const results = {};
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, hasTouch: true });
    page.on('pageerror', (error) => { errors.push(error.message); });
    let modelRequests = 0;
    page.on('request', (request) => {
        if (request.url().endsWith('/cabin.glb')) modelRequests++;
    });
    await page.goto(`${baseUrl}/preview.html`, { waitUntil: 'networkidle0' });
    const screen = await instance(page, '/src/ui/screens/PreviewScreen.js', 'PreviewScreen');
    await page.waitForFunction((preview) => { return preview.ready; }, {}, screen);
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction((preview) => {
        return Math.abs(preview.world.cabin.bindings.steering_wheel.quaternion.z) > 0.1;
    }, {}, screen);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('A');
    await page.waitForFunction((preview) => { return preview.vehicle.engine.gear === 1; }, {}, screen);
    await page.keyboard.press('8');
    await page.waitForFunction((preview) => {
        return preview.world.cabin.leds.some((led) => { return led.material.emissiveIntensity > 0; });
    }, {}, screen);
    await page.keyboard.press('9');
    await page.waitForFunction((preview) => { return preview.world.cabin.windshield.mesh.visible; }, {}, screen);
    await page.keyboard.press('8');
    await page.keyboard.press('9');
    const { CABIN_VIEWS } = await import('../src/data/cabinViews.js');
    for (const [i, view] of CABIN_VIEWS.entries()) {
        await page.keyboard.press(`Digit${i + 1}`);
        await page.waitForFunction((preview, yaw) => {
            return Math.abs(preview.head.yaw.value + yaw) < 0.01;
        }, {}, screen, view.yaw);
        await page.screenshot({ path: `${output}/${view.id}.png` });
    }
    await page.keyboard.press('C');
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(750, 350);
    await page.mouse.up();
    await page.waitForFunction((preview) => { return preview.head.lookYaw > 0.5 && preview.head.lookPitch > 0.1; }, {}, screen);
    await page.keyboard.press('C');
    await page.waitForFunction((preview) => { return Math.abs(preview.head.yaw.value) < 0.01; }, {}, screen);
    const touch = await page.touchscreen.touchStart(600, 400);
    await touch.move(750, 350);
    await touch.end();
    await page.waitForFunction((preview) => { return preview.head.lookYaw > 0.5 && preview.head.lookPitch > 0.1; }, {}, screen);
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
        return { geometrySurvivedReload: !disposed, textures: world.renderer.info.memory.textures, geometries: world.renderer.info.memory.geometries };
    }, screen);
    assert.equal(modelRequests, 1, 'the asset must only be fetched once across reloads');
    results.preview.modelRequests = modelRequests;
    results.preview.performance = await measure(page, screen);
    await page.goto(`${baseUrl}/preview.html?car=ferrari`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: `${output}/procedural-ferrari.png` });
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    const game = await instance(page, '/src/core/Game.js', 'Game');
    await page.keyboard.press('Enter');
    await page.waitForFunction((value) => { return value.screen.constructor.name === 'SelectScreen'; }, {}, game);
    await page.keyboard.press('Enter');
    await page.waitForFunction((value) => { return value.screen.state === 'driving'; }, {}, game);
    const drive = await page.evaluateHandle((value) => { return value.screen; }, game);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction((value) => { return value.vehicle.speedMph > 10; }, {}, drive);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('P');
    const pausedS = await page.evaluate((value) => { return value.vehicle.s; }, drive);
    await page.keyboard.press('Digit7');
    await page.waitForFunction((value) => { return value.head.yaw.value < -2; }, {}, drive);
    const stoppedS = await page.evaluate((value) => { return value.vehicle.s; }, drive);
    assert.equal(stoppedS, pausedS, 'look-around while paused must not move the vehicle');
    await page.screenshot({ path: `${output}/driving-paused-rear.png` });
    results.driving = await page.evaluate((value) => {
        return { speedMph: value.vehicle.speedMph, paused: value.paused, yaw: value.head.yaw.value };
    }, drive);
    results.driving.performance = await measure(page, drive);
    await page.setRequestInterception(true);
    let attempts = 0;
    page.on('request', async (request) => {
        if (request.url().endsWith('/cabin.glb') && attempts++ === 0) {
            await request.respond({ status: 503, headers: { 'cache-control': 'no-store' }, body: 'unavailable' });
        } else await request.continue();
    });
    await page.goto(`${baseUrl}/preview.html`, { waitUntil: 'domcontentloaded' });
    const retry = await instance(page, '/src/ui/screens/PreviewScreen.js', 'PreviewScreen');
    await page.waitForFunction((value) => { return value.failed && !value.ready; }, {}, retry);
    await page.keyboard.press('Enter');
    await page.waitForFunction((value) => { return value.ready; }, {}, retry);
    assert.equal(attempts, 2, 'a failed configured asset must retry rather than fall back');
    results.failedAssetRetry = true;
    assert.deepEqual(errors, [], 'browser exceptions');
    results.totalModelRequests = modelRequests;
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 4) + '\n');
    console.info(JSON.stringify(results));
} finally {
    await browser.close();
}
