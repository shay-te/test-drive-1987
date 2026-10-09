import { NO_TILE } from './noTiling.js';

/** GLSL: a photograph projected onto the world along the two of its axes the surface faces most
 *  (Inigo Quilez, "biplanar mapping"), blended by how it faces them, so it never stretches up a cliff;
 *  each projection is sampled without visible tiling (NO_TILE). The relief of its normal map tilts the
 *  surface normal (world space). */
const TRIPLANAR = `
varying vec3 vTriWorld;
varying vec3 vTriNormal;
/** The axis the normal leans along most, the one it leans along least, and the blend of the two kept. */
void biplanarAxes(vec3 n, out ivec3 major, out ivec3 median, out vec2 w) {
    vec3 a = abs(n);
    major = a.x > a.y && a.x > a.z ? ivec3(0, 1, 2) : a.y > a.z ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
    ivec3 minor = a.x < a.y && a.x < a.z ? ivec3(0, 1, 2) : a.y < a.z ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
    median = ivec3(3) - minor - major;
    w = clamp((vec2(a[major.x], a[median.x]) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
    w = pow(w, vec2(2.0));
    w /= w.x + w.y;
}
vec4 axisSample(sampler2D tex, ivec3 axis, vec3 p, vec3 dx, vec3 dy) {
    return textureNoTileGrad(tex, vec2(p[axis.y], p[axis.z]), vec2(dx[axis.y], dx[axis.z]), vec2(dy[axis.y], dy[axis.z]));
}
vec3 triplanarColor(sampler2D tex, vec3 p, vec3 dx, vec3 dy, vec3 n, float metres) {
    ivec3 major;
    ivec3 median;
    vec2 w;
    biplanarAxes(n, major, median, w);
    p /= metres;
    dx /= metres;
    dy /= metres;
    vec3 c = axisSample(tex, major, p, dx, dy).rgb * w.x;
    if (w.y > 0.0) c += axisSample(tex, median, p, dx, dy).rgb * w.y;
    return c;
}
vec3 triplanarNormal(sampler2D tex, vec3 p, vec3 dx, vec3 dy, vec3 n, float metres) {
    ivec3 major;
    ivec3 median;
    vec2 w;
    biplanarAxes(n, major, median, w);
    p /= metres;
    dx /= metres;
    dy /= metres;
    vec3 tilt = vec3(0.0);
    vec2 t = axisSample(tex, major, p, dx, dy).xy * 2.0 - 1.0;
    tilt[major.y] += t.x * w.x;
    tilt[major.z] += t.y * w.x;
    if (w.y > 0.0) {
        t = axisSample(tex, median, p, dx, dy).xy * 2.0 - 1.0;
        tilt[median.y] += t.x * w.y;
        tilt[median.z] += t.y * w.y;
    }
    return normalize(n + tilt);
}
vec3 toView(vec3 world) {
    return normalize((viewMatrix * vec4(world, 0.0)).xyz);
}
`;

/** GLSL statements opening a triplanar fragment: the surface's world normal and the screen derivatives
 *  of its world position (taken here, outside any branch). */
export const TRI_START = `vec3 triN = normalize(vTriNormal);
    vec3 triDx = dFdx(vTriWorld);
    vec3 triDy = dFdy(vTriWorld);`;

/** Declares a rock photograph's uniforms and the triplanar functions in a fragment shader, after
 *  NO_TILE (which they call), adding NO_TILE first unless withoutTiling already has. */
export function triplanarFragment(fragment) {
    const head = 'uniform sampler2D rockMap;\nuniform sampler2D rockNormal;\n';
    if (fragment.includes(NO_TILE)) return fragment.replace(NO_TILE, `${head}${NO_TILE}\n${TRIPLANAR}`);
    return `${head}${NO_TILE}\n${TRIPLANAR}\n${fragment}`;
}

/** Gives `shader` the rock photograph (`map` and `normal` textures) and passes the world position and
 *  normal on to its fragment shader. */
export function triplanarVertex(shader, { map, normal }) {
    shader.uniforms.rockMap = { value: map };
    shader.uniforms.rockNormal = { value: normal };
    shader.vertexShader = `varying vec3 vTriWorld;\nvarying vec3 vTriNormal;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
    vec4 triWorld = vec4(transformed, 1.0);
    vec3 triNormal = objectNormal;
    #ifdef USE_INSTANCING
        triWorld = instanceMatrix * triWorld;
        triNormal = mat3(instanceMatrix) * triNormal;
    #endif
    vTriWorld = (modelMatrix * triWorld).xyz;
    vTriNormal = normalize(mat3(modelMatrix) * triNormal);`,
    );
}

/** `material` (a standard material without map) in a rock photograph laid along the world's axes:
 *  `textures` = { map, normal }, `metres` across one photograph; `key` names the program. */
export function triplanarRock(material, key, textures, metres) {
    const span = metres.toFixed(2);
    material.onBeforeCompile = (shader) => {
        triplanarVertex(shader, textures);
        shader.fragmentShader = triplanarFragment(shader.fragmentShader)
            .replace('#include <color_fragment>', `${TRI_START}
    diffuseColor.rgb *= triplanarColor(rockMap, vTriWorld, triDx, triDy, triN, ${span});
#include <color_fragment>`)
            .replace('#include <clearcoat_normal_fragment_begin>', `normal = toView(triplanarNormal(rockNormal, vTriWorld, triDx, triDy, triN, ${span}));
#include <clearcoat_normal_fragment_begin>`);
    };
    material.customProgramCacheKey = () => { return `triplanar-${key}`; };
    return material;
}
