/** Cuts the game's crash sounds from CC0 recordings on Freesound into assets/audio/effects/: each
 *  effect's variants (the stretch of its recording that is the hit itself), faded out and levelled,
 *  listed in the manifest the AudioManager loads. Each sound page is checked for CC0 first.
 *  Usage: node scripts/import-sounds.mjs (downloads are cached in tmp/route-cache) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodeMono, wav } from './audio.mjs';
import { download } from './sources.mjs';

const OUTPUT = 'assets/audio/effects';
const SAMPLE_RATE = 32000;
const CC0 = 'creativecommons.org/publicdomain/zero/1.0';
/** The last FADE_SECONDS of a variant fade out; its peak is set to PEAK. */
const FADE_SECONDS = 0.25;
const PEAK = 0.89;
/** Freesound sounds: page (user/id), public high-quality preview, and the stretches (s) that are the hit. */
const SOURCES = [
    { effect: 'crash', user: 'magnuswaker', id: 592388, preview: '592/592388_11537497', title: 'Car Crash (with Glass)', cuts: [[0, 2.5]] },
    { effect: 'crash', user: 'softwalls', id: 449062, preview: '449/449062_6070740', title: 'Car accident. Real. Interior.', cuts: [[0.55, 2.6]] },
    { effect: 'crash', user: 'squareal', id: 237375, preview: '237/237375_1502374', title: 'Car Crash', cuts: [[0.35, 2.6]] },
    { effect: 'impact', user: 'LPA134', id: 329516, preview: '329/329516_424694', title: 'Hood Impact', cuts: [[0.18, 1.4]] },
    { effect: 'impact', user: 'craigsmith', id: 675475, preview: '675/675475_2524442', title: 'S36-09 Metal foley for car crash; much crunching.wav', cuts: [[0.05, 1.2], [3.75, 1.2], [6.8, 1.2]] },
    { effect: 'crack', user: 'Sanderboah', id: 806423, preview: '806/806423_13017680', title: 'Car windshield crack', cuts: [[0, 1.2]] },
];

const manifest = {};
for (const source of SOURCES) {
    const page = (await download(`https://freesound.org/people/${source.user}/sounds/${source.id}/`, `freesound-${source.id}.html`)).toString('utf8');
    if (!page.includes(CC0)) throw new Error(`Freesound ${source.id} is no longer CC0`);
    await download(`https://cdn.freesound.org/previews/${source.preview}-hq.mp3`, `freesound-${source.id}.mp3`);
    const pcm = decodeMono(`tmp/route-cache/freesound-${source.id}.mp3`, SAMPLE_RATE);
    for (const [start, seconds] of source.cuts) {
        const cut = pcm.slice(Math.round(start * SAMPLE_RATE), Math.round((start + seconds) * SAMPLE_RATE));
        const fade = Math.round(FADE_SECONDS * SAMPLE_RATE);
        cut.forEach((v, i) => { cut[i] = v * Math.min(1, (cut.length - i) / fade); });
        const peak = cut.reduce((most, v) => { return Math.max(most, Math.abs(v)); }, 0);
        const levelled = cut.map((v) => { return (v * PEAK) / peak; });
        manifest[source.effect] ??= [];
        const file = `${OUTPUT}/${source.effect}-${manifest[source.effect].length + 1}.wav`;
        manifest[source.effect].push(file);
        mkdirSync(OUTPUT, { recursive: true });
        writeFileSync(file, wav(levelled, SAMPLE_RATE));
        console.info(`[sounds] ${file}: "${source.title}" by ${source.user} (Freesound ${source.id}, CC0) @ ${start}-${Number((start + seconds).toFixed(2))} s`);
    }
}
writeFileSync(`${OUTPUT}/manifest.json`, `${JSON.stringify(manifest, null, 4)}\n`);
