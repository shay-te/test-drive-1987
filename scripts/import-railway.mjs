/** Imports the railway along the Sea-to-Sky route from OpenStreetMap (ODbL): the main line, BC Rail's
 *  in 1987 (CN's Squamish Subdivision now), its sidings and bridges, leaving out its tunnels, the
 *  track inside buildings and the abandoned and disused spurs. Each line keeps its points (microdegrees, the first absolute and the
 *  rest as steps) and whether it is a bridge.
 *  Usage: node scripts/import-railway.mjs (the query is cached in tmp/route-cache) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROUTE_RAILWAY } from '../src/data/scenery.js';
import { packMicro } from './geo.mjs';
import { ROUTE_BOX, overpass } from './sources.mjs';

const elements = await overpass(`[out:json][timeout:120];way["railway"="rail"](${ROUTE_BOX.join(',')});out geom tags;`, 'railway.json');
const lines = elements
    // Through a hillside or a building (an engine shed), the track is out of sight.
    .filter(({ tags }) => { return !tags.tunnel; })
    .map(({ geometry, tags }) => {
        return { bridge: tags.bridge === 'yes', p: packMicro(geometry.map(({ lat, lon }) => { return [lat, lon]; })) };
    });
mkdirSync(ROUTE_RAILWAY.split('/').slice(0, -1).join('/'), { recursive: true });
writeFileSync(ROUTE_RAILWAY, `${JSON.stringify({ source: 'OpenStreetMap contributors (ODbL)', lines })}\n`);
const bridges = lines.filter(({ bridge }) => { return bridge; }).length;
console.info(`[railway] ${lines.length} stretches of track, ${bridges} of them bridges, ${elements.length - lines.length} tunnels left out -> ${ROUTE_RAILWAY}`);
