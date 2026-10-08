# Cabin assets

This milestone proves the mechanics with a deliberately simple complete Porsche cabin. Detailed modeling belongs to the next phase. The other four cars retain their current procedural cabins until they have authored assets.

## Contract

Export glTF 2.0 as a self-contained, uncompressed GLB. Use metres, X right, Y up, and forward along -Z in the exported asset. The origin is the driver's longitudinal eye position at road height. Apply object scale before export; keep animation pivots as separate named nodes with their neutral orientation intact.

The runtime requires unique nodes named `driver_eye`, `mirror_camera`, `steering_wheel`, `gear_lever`, `instrument_surface`, `trip_surface`, `mirror_surface`, `windshield_surface`, and `radar_led_0` through `radar_led_5`. The four surfaces must be UV-mapped meshes. Surface UVs cover the full image, using standard glTF image coordinates (the exported top edge is V=0). The wheel rotates around its local Z axis; the lever tilts around its local X and Z axes. The mirror camera points backwards along the car's +Z axis. The driver camera is attached to `driver_eye` and stays seated.

The cluster, trip display, mirror picture, windshield cracks, and radar illumination are runtime-owned. Do not bake speed, gear, warnings, or other changing text into textures. Preserve the named surfaces and pivots while replacing the surrounding geometry. Static materials and textures belong to the cached asset; runtime textures and material overrides belong to each cabin instance. Cabin teardown must not dispose cached geometry or materials, or the shared mirror render target.

Model the entire visible interior: dashboard, console, both doors, front seats, headliner, pillars, rear seating, and rear window. Include the bonnet visible through the windshield. Check all seated viewpoints, not just the forward image. Use reference images to establish real proportions and material appearance; this integration asset is not a visual reference.

## Source and export

`porsche/cabin.json` is the mechanical layout in game coordinates. `scripts/blender/export_cabin.py` generates the simple integration model and saves an editable `.blend` plus its GLB. Blender uses Z-up internally; the script converts coordinates before the standard Y-up glTF export. Keep its source and layout reproducible. For detailed modeling, retain the edited `.blend` as the authoritative source and export using the same contract.

The runtime loads the path declared in `car.cockpit.model`. A missing or invalid configured model is an error, not a reason to silently substitute procedural geometry.

## Acceptance

- Assets validate, load once, and survive stage changes and repeated car selection.
- Wheel, lever, instruments, trip display, mirror, radar, and windshield damage respond to game state.
- Seated yaw and pitch controls work while driving, stay bounded, and return to forward view.
- All interior viewpoints are inspectable in the asset preview and in-game.
- Repository checks pass; performance and browser evidence are recorded before handover.

## Running Blender

From the repository root on WSL with the verified Windows installation:

```sh
BLENDER_BIN='/mnt/c/Program Files/Blender Foundation/Blender 4.1/blender.exe'
"$BLENDER_BIN" --background --factory-startup --python-exit-code 1 \
    --python "$(wslpath -w "$PWD/scripts/blender/export_cabin.py")" -- \
    --layout "$(wslpath -w "$PWD/assets/models/porsche/cabin.json")" \
    --output "$(wslpath -w "$PWD/assets/models/porsche/cabin.glb")"
```

Windows execution from the agent requires permission to run outside its sandbox. A native Blender installation can use the same script with Linux paths.

After editing `cabin.blend`, export that file instead of regenerating the integration geometry:

```sh
"$BLENDER_BIN" --background "$(wslpath -w "$PWD/assets/models/porsche/cabin.blend")" \
    --python-exit-code 1 --python "$(wslpath -w "$PWD/scripts/blender/export_cabin.py")" -- \
    --layout "$(wslpath -w "$PWD/assets/models/porsche/cabin.json")" \
    --output "$(wslpath -w "$PWD/assets/models/porsche/cabin.glb")" --export-only
npm run assets
npm run check
```

## Inspecting and verifying

Run `npm start`, then open `http://localhost:8080/preview.html`. URL parameters select the car, lighting stage, and initial view; for example `preview.html?car=porsche&stage=4&view=rear`. In both the game and preview, keys 1–7 select dashboard, console, driver door, passenger door, front seats, roof, and rear cabin. Q/E rotate horizontally, R/F rotate vertically, C centres, and dragging adjusts both axes. The gamepad right stick looks around; its press centres. The preview also supports live steering, A/Z shifting, up-arrow revving, and keys 8/9 toggling radar and windshield damage.

`npm run browser` uses Playwright to exercise the real renderer, export screenshots, check cache ownership and controls, and measure rendering. It rejects unexpected console errors, including caught loading failures. It also starts real Firefox and tests versionless, major-only, and conventional Firefox user-agent strings in Chromium. It requires a running game server and Playwright as a development tool. A temporary tool install is sufficient:

```sh
npm install --prefix /tmp/test-drive-tools --no-save playwright@1.64.0
node /tmp/test-drive-tools/node_modules/playwright/cli.js install chromium firefox
PLAYWRIGHT_MODULE=/tmp/test-drive-tools/node_modules/playwright/index.mjs npm run browser
```

`GAME_URL` changes the server URL and `CABIN_EVIDENCE` changes the default `/tmp/test-drive-cabin-evidence` output directory. Browser verification uses the actual pinned three.js CDN modules. Screenshots and benchmark results are evidence, not game assets.

`BROWSER_BIN` optionally selects an existing Chromium installation. `CABIN_REGRESSION_ONLY=1` runs the shorter loading/rendering matrix; this is required before GitHub Pages publication. The renderer and addons remain pinned to 0.180.0. GLTFLoader alone is locally patched to guard a failing Firefox version match; its license and exact changes are recorded in `vendor/three/README.md`.

## Modeling handoff

Before detailed modeling, obtain and record sources for left-hand-drive 1987 Porsche 930 dashboard, doors, seats, headliner, rear seating/window, console, and the view over the bonnet. Include several angles and dimensional references. The old procedural layout and this simple GLB establish mechanical attachment locations; they do not establish historical visual accuracy. No reference photo set has been supplied or verified in this milestone.

Preserve runtime bindings and their local axes. The GLB mirror camera is independent of the driver's head, and its texture is rendered using the world layer. Live display UVs must use glTF's top-down image convention; the runtime handles the render-target mirror's different convention. Each runtime surface must be a single mesh primitive. Do not add static glass over the live windshield surface, or duplicate the wheel/lever in the static shell.

For the first detailed cabin, target at most 100,000 triangles, 50 cabin draw calls, an 8 MiB GLB, and 64 MiB of uncompressed texture data. These are initial engineering budgets to compare against the measured integration baseline, not validated hardware limits. Use normal/roughness maps for fine grain, modest texture sizes away from the dashboard, and merged static geometry where it does not destroy runtime bindings. Measure the full driving scene and mirror, not just the isolated preview. Keep the no-build browser delivery and pinned renderer version.

The integration GLB is 186,404 bytes with 2,200 source triangles, 49 nodes, and 42 meshes. On 2026-10-08, Chrome 148 in headless WSL using SwiftShader at 1280×800 produced the following baseline. Counters include all render passes and shadows; the 50-call modeling budget above applies to the cabin's main pass. Frame intervals are medians of 30 animation frames, not a GPU benchmark or a hardware frame-rate promise.

| Scene | Draw calls, all passes | Triangles, all passes | Resident textures | Resident geometries | Median frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Isolated Porsche preview | 71 | 4,032 | 6 | 43 | 139.6 ms |
| Paused stage 1, looking rearward | 103 | 1,003,026 | 30 | 309 | 554.6 ms |

The browser check verified one asset request across three cabin reloads, preservation of cached geometry, animated controls, damage/radar overlays, mouse and emulated touch looking, paused-camera behavior, and recovery from an injected HTTP 503. It wrote screenshots for all seven cabin views and JSON measurements to `/tmp/test-drive-cabin-evidence`. Those software-renderer timings motivate measuring on the target desktop and phone before increasing visual complexity.

Compare all seven inspection views plus the forward driver view, under midday and sunset lighting. Verify animated controls and displays after each export. Visual acceptance belongs to the later modeling phase; physical phone performance and connected gamepad hardware still need device checks.
