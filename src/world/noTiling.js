import * as THREE from 'three';

/** GLSL: a tiled texture sampled without visible repetition (Inigo Quilez, "texture repetition",
 *  technique 3): a smooth noise picks, region by region, two of eight shifted copies of the texture
 *  and blends them, two reads in all. Shifts don't turn a normal map's slopes. The Grad form takes the
 *  uv's screen derivatives, so it can run inside a branch. */
export const NO_TILE = `
float tileHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}
float tileNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(tileHash(i), tileHash(i + vec2(1.0, 0.0)), f.x), mix(tileHash(i + vec2(0.0, 1.0)), tileHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 textureNoTileGrad(sampler2D tex, vec2 uv, vec2 dx, vec2 dy) {
    float pick = tileNoise(uv * 0.4) * 8.0;
    float i = floor(pick);
    vec4 a = textureGrad(tex, uv + sin(vec2(3.0, 7.0) * i), dx, dy);
    vec4 b = textureGrad(tex, uv + sin(vec2(3.0, 7.0) * (i + 1.0)), dx, dy);
    return mix(a, b, smoothstep(0.2, 0.8, fract(pick)));
}
vec4 textureNoTile(sampler2D tex, vec2 uv) {
    return textureNoTileGrad(tex, uv, dFdx(uv), dFdy(uv));
}
`;

/** Makes a standard material's `map` and `normalMap` (and any of `extra`'s replacements, applied to its
 *  fragment shader) sample without visible repetition; `key` names the resulting program. */
export function withoutTiling(material, key, extra = (fragment) => { return fragment; }) {
    material.onBeforeCompile = (shader) => {
        const map = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'textureNoTile( map, vMapUv )');
        const normals = THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )', 'textureNoTile( normalMap, vNormalMapUv )');
        shader.fragmentShader = extra(`${NO_TILE}\n${shader.fragmentShader}`
            .replace('#include <map_fragment>', material.map?.wrapS === THREE.RepeatWrapping ? map : '#include <map_fragment>')
            .replace('#include <normal_fragment_maps>', normals), shader);
    };
    material.customProgramCacheKey = () => { return `no-tiling-${key}`; };
    return material;
}
