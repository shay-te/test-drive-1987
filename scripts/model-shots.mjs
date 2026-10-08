/** Looks at car models in a real browser while `npm start` serves the repo (GAME_URL overrides it).
 *    view <name> "<query>"          screenshot scripts/model-viewer.html?<query> to tmp/shots/<name>.png
 *    pick "<query>" x,y [x,y ...]   print the part, material, point and normal under each pixel
 *    preview <carId> <view>[+keys]  screenshot the game's cabin preview (view: forward or a CABIN_VIEWS id;
 *                                   keys pressed after loading, e.g. dashboard+89 for radar and damage)
 *  Needs Playwright with Chromium (see assets/models/README.md). */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.GAME_URL ?? 'http://127.0.0.1:8080';
const output = 'tmp/shots';
/** The preview fades in its cabin and turns the head towards a view before it settles. */
const PREVIEW_SETTLE_MS = 6000;
const [mode, ...args] = process.argv.slice(2);

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => { errors.push(error.message); });
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const openViewer = async (query) => {
    await page.goto(`${baseUrl}/scripts/model-viewer.html?${query}`);
    await page.waitForFunction(() => { return window.viewerReady; }, null, { timeout: 180_000 });
};

try {
    if (mode === 'view') {
        const [name, query] = args;
        await openViewer(query);
        await page.screenshot({ path: `${output}/${name}.png` });
        console.info(`${output}/${name}.png`);
    } else if (mode === 'pick') {
        const [query, ...pixels] = args;
        await openViewer(query);
        for (const pixel of pixels) {
            const hit = await page.evaluate(([x, y]) => { return window.pick(x, y); }, pixel.split(',').map(Number));
            console.info(pixel.padEnd(10), JSON.stringify(hit));
        }
    } else if (mode === 'preview') {
        const [carId, ...views] = args;
        for (const entry of views) {
            const [view, keys = ''] = entry.split('+');
            await page.goto(`${baseUrl}/preview.html?car=${carId}${view === 'forward' ? '' : `&view=${view}`}`);
            await page.waitForTimeout(PREVIEW_SETTLE_MS);
            for (const key of keys) await page.keyboard.press(`Digit${key}`);
            const path = `${output}/${carId}-${entry.replace('+', '-')}.png`;
            await page.screenshot({ path });
            console.info(path);
        }
    } else {
        throw new Error('Usage: model-shots.mjs view|pick|preview ... (see the header of this script)');
    }
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} finally {
    await browser.close();
}
