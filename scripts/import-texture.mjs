/** Imports a Poly Haven texture (CC0) into assets/textures/<id>/: its colour and OpenGL normal map at 1k,
 *  re-encoded as smaller JPEGs; `saturation` (0..1) greys the colour (warm sandstone to granite).
 *  Usage: node scripts/import-texture.mjs <polyhaven id> [saturation] */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const API = 'https://api.polyhaven.com/files';
const RESOLUTION = '1k';
const QUALITY = 82;
/** Poly Haven's map names and the files they become. */
const MAPS = { Diffuse: 'diffuse.jpg', nor_gl: 'normal.jpg' };

const id = process.argv[2];
const saturation = Number(process.argv[3] ?? 1);
if (!id) throw new Error('Usage: node scripts/import-texture.mjs <polyhaven id> [saturation]');
const files = await (await fetch(`${API}/${id}`)).json();
const folder = `assets/textures/${id}`;
mkdirSync(folder, { recursive: true });
for (const [map, name] of Object.entries(MAPS)) {
    const source = files[map]?.[RESOLUTION]?.jpg?.url;
    if (!source) throw new Error(`${id} has no ${RESOLUTION} ${map} map`);
    const bytes = Buffer.from(await (await fetch(source)).arrayBuffer());
    const image = map === 'Diffuse' ? sharp(bytes).modulate({ saturation }) : sharp(bytes);
    const out = await image.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    writeFileSync(`${folder}/${name}`, out);
    console.info(`[texture] ${folder}/${name}: ${(bytes.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
}
