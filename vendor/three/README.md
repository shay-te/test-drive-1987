# GLTFLoader 0.180.0

This is the MIT-licensed loader from three.js 0.180.0, matching the game's pinned renderer. Source: https://github.com/mrdoob/three.js/blob/r180/examples/jsm/loaders/GLTFLoader.js

Local changes:

- Import BufferGeometryUtils through the pinned addon import map.
- Guard the Firefox version match and accept a major-only version. An unrecognized Firefox version retains the upstream conservative TextureLoader path instead of throwing during parser construction.

Do not edit the browser's navigator or substitute geometry on failure. When updating three.js, recheck upstream browser detection and rerun the browser regression before removing this patch. The upstream license is retained in LICENSE.
