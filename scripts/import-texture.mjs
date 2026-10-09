/** Imports a Poly Haven texture (CC0) into assets/textures/<id>/: its colour and OpenGL normal map at 1k,
 *  re-encoded as smaller JPEGs. `grade` is a saturation (0..1) that greys the colour (warm sandstone to
 *  granite); `detail`: grey only, centred on mid-grey, to multiply over other colours; `colour`: the
 *  colour as it is. Neither of the last two takes the normal map.
 *  Usage: node scripts/import-texture.mjs <polyhaven id> [grade] */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const API = 'https://api.polyhaven.com/files';
const RESOLUTION = '1k';
const QUALITY = 82;
/** Poly Haven's map names and the files they become. */
const MAPS = { Diffuse: 'diffuse.jpg', nor_gl: 'normal.jpg' };

const id = process.argv[2];
const detail = process.argv[3] === 'detail';
const colourOnly = detail || process.argv[3] === 'colour';
const saturation = detail ? 0 : process.argv[3] === 'colour' ? 1 : Number(process.argv[3] ?? 1);
if (!id) throw new Error('Usage: node scripts/import-texture.mjs <polyhaven id> [grade]');
/** A detail texture's mean grey. */
const MID_GREY = 128;
const files = await (await fetch(`${API}/${id}`)).json();
const folder = `assets/textures/${id}`;
mkdirSync(folder, { recursive: true });
for (const [map, name] of Object.entries(MAPS)) {
    if (colourOnly && map !== 'Diffuse') continue;
    const source = files[map]?.[RESOLUTION]?.jpg?.url;
    if (!source) throw new Error(`${id} has no ${RESOLUTION} ${map} map`);
    const bytes = Buffer.from(await (await fetch(source)).arrayBuffer());
    let image = map === 'Diffuse' ? sharp(bytes).modulate({ saturation }) : sharp(bytes);
    if (detail) {
        const { data, info } = await sharp(bytes).grayscale().raw().toBuffer({ resolveWithObject: true });
        const mean = data.reduce((sum, v) => { return sum + v; }, 0) / data.length;
        const grey = Buffer.from(data.map((v) => { return Math.min(255, Math.round((v * MID_GREY) / mean)); }));
        image = sharp(grey, { raw: { width: info.width, height: info.height, channels: 1 } });
    }
    const out = await image.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    writeFileSync(`${folder}/${name}`, out);
    console.info(`[texture] ${folder}/${name}: ${(bytes.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
}
