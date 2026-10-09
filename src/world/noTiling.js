import * as THREE from 'three';

/** GLSL: a tiled texture sampled without visible repetition. Each tile is shifted and mirrored at
 *  random and neighbouring tiles blend into each other (Inigo Quilez, "texture repetition"); mirrored
 *  normal-map samples have their slopes turned back the right way. */
const NO_TILE = `
vec4 tileHash(vec2 p) {
    return fract(sin(vec4(1.0 + dot(p, vec2(37.0, 17.0)), 2.0 + dot(p, vec2(11.0, 47.0)),
        3.0 + dot(p, vec2(41.0, 29.0)), 4.0 + dot(p, vec2(23.0, 31.0)))) * 103.0);
}
vec4 textureNoTile(sampler2D tex, vec2 uv, bool normals) {
    vec2 tile = floor(uv);
    vec2 blend = smoothstep(0.25, 0.75, fract(uv));
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    vec4 sampled[4];
    for (int i = 0; i < 4; i++) {
        vec4 h = tileHash(tile + vec2(float(i % 2), float(i / 2)));
        vec2 flip = sign(h.zw - 0.5);
        vec4 s = textureGrad(tex, uv * flip + h.xy, dx * flip, dy * flip);
        if (normals) s.xy = (s.xy * 2.0 - 1.0) * flip * 0.5 + 0.5;
        sampled[i] = s;
    }
    return mix(mix(sampled[0], sampled[1], blend.x), mix(sampled[2], sampled[3], blend.x), blend.y);
}
`;

/** Makes a standard material's `map` and `normalMap` (and any of `extra`'s replacements, applied to its
 *  fragment shader) sample without visible repetition; `key` names the resulting program. */
export function withoutTiling(material, key, extra = (fragment) => { return fragment; }) {
    material.onBeforeCompile = (shader) => {
        const map = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'textureNoTile( map, vMapUv, false )');
        const normals = THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )', 'textureNoTile( normalMap, vNormalMapUv, true )');
        shader.fragmentShader = extra(`${NO_TILE}\n${shader.fragmentShader}`
            .replace('#include <map_fragment>', material.map?.wrapS === THREE.RepeatWrapping ? map : '#include <map_fragment>')
            .replace('#include <normal_fragment_maps>', normals), shader);
    };
    material.customProgramCacheKey = () => { return `no-tiling-${key}`; };
    return material;
}
