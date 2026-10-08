import { clusterBounds } from './clusters.js';
import {
    drawBarGraph,
    drawDialFace,
    drawDigits,
    drawGlass,
    drawLabel,
    drawLamp,
    drawNeedle,
} from './Gauges.js';
import { formatReading } from './instruments.js';

/** Texture pixels per cluster layout pixel. */
const TEXELS = 1.5;
const BACKING = '#070708';

/** The instrument cluster painted for the 3D binnacle: faces once, needles, LCDs and lamps per frame. */
export class ClusterFace {
    constructor(resources, cluster, name) {
        this.cluster = cluster;
        this.bounds = clusterBounds(cluster);
        const b = this.bounds;
        this.canvas = document.createElement('canvas');
        this.canvas.width = Math.round(b.w * TEXELS);
        this.canvas.height = Math.round(b.h * TEXELS);
        this.ctx = this.canvas.getContext('2d');
        this.faces = resources.scaledCanvas(`cluster:${name}`, b.w, b.h, TEXELS, (ctx) => {
            ctx.fillStyle = BACKING;
            ctx.fillRect(0, 0, b.w, b.h);
            ctx.translate(-b.x, -b.y);
            for (const item of cluster.instruments) {
                if (item.type === 'dial') drawDialFace(ctx, item);
                if (item.type === 'text') drawLabel(ctx, item);
            }
        });
    }

    /** Repaints the live parts from `state` (a CockpitState), the readings and the lamps. */
    paint(state, readings, lamps) {
        const { ctx, bounds: b } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.faces, 0, 0);
        ctx.setTransform(TEXELS, 0, 0, TEXELS, -b.x * TEXELS, -b.y * TEXELS);
        for (const item of this.cluster.instruments) {
            const value = state.needle(item);
            if (item.type === 'dial') drawNeedle(ctx, item, value);
            if (item.type === 'bar') drawBarGraph(ctx, item, value / item.max);
            if (item.type === 'digits')
                drawDigits(ctx, item, formatReading(item.format, readings[item.source]));
        }
        for (const lamp of this.cluster.lamps) drawLamp(ctx, lamp, lamps[lamp.source]);
        for (const item of this.cluster.instruments) {
            if (item.type === 'dial') drawGlass(ctx, item);
        }
    }
}
