import { GRAPHICS } from '../config.js';

/** Renderers that draw on the CPU, by the names WebGL reports for them. */
const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software Renderer|Microsoft Basic Render/i;

/** The GRAPHICS tier for a WebGL renderer reporting `name`. */
export function graphicsTier(name) {
    return SOFTWARE.test(name) ? GRAPHICS.software : GRAPHICS.full;
}

/** The name the WebGL context `gl` gives its renderer (the real one where the browser tells). */
export function rendererName(gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
}
