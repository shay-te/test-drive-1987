# Car models and cabin assets

The Porsche and the Ferrari are driven from the inside of full 3D models: each `cabin.glb` holds the
complete car, exterior and interior, plus the parts the game animates and draws on. The title screen
photographs the same file side-on. The other three cars have no model yet and are locked.

## Sources and credits

| Car | Source model | Author | License |
| --- | --- | --- | --- |
| Porsche 911 Turbo | [Porsche 911 turbo 930 Johnny Silverhand's](https://sketchfab.com/3d-models/porsche-911-turbo-930-johnny-silverhands-25656a7a831442059de7a466f4a17692) | valvetin | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Ferrari Testarossa | [1986 Ferrari Testarossa](https://sketchfab.com/3d-models/1986-ferrari-testarossa-36865e4d4d21482bb268520aafca1196) | Res1n | Sketchfab Standard |

The downloaded files are kept unchanged next to each car's `cabin.glb`
(`porsche/porsche_911_turbo_930_johnny_silverhands.glb`, `ferrari/1986_ferrari_testarossa.glb`).
The game's `cabin.glb` is derived from them: turned into game space, decimated, with hidden engine
parts removed, materials adjusted, and the runtime parts below added.

## Import pipeline

`scripts/import-car.mjs <carId>` turns `assets/models/<carId>/<source>.glb` into
`assets/models/<carId>/cabin.glb`, following `assets/models/<carId>/import.json`:

- `yawDeg`, `centreOn` — turn the model nose-first along −z and centre it across. It is scaled to
  `body.length` from `src/data/cars.js`, put on the road, and moved so the nose is `body.eye` ahead of
  the seated eye (the origin).
- `remove`, `materials`, `translucent` — drop hidden parts by node name, fix materials (alpha mode,
  colour, opacity, roughness), and move a texture atlas's window parts onto a translucent copy.
- `normals.creaseDeg`, `pruneBelow` — for flat-shaded sources: weld by position and rebuild normals
  with that crease angle; drop loose pieces smaller than that many metres (tread blocks, tiny badges).
- `eye`, `steeringWheel`, `windshield` — the seated eye `[x, y]`; the wheel parts (their hub and axis
  are found from the geometry) and an optional material; the windshield node, or a box and facing
  that select its triangles from a larger glass mesh.
- `instrument`, `trip`, `mirror`, `radar`, `lever`, `console` — where the live dials, trip display,
  rear-view mirror, radar detector and gear lever sit (centre, facing normal, width). `instrument.backing`
  blanks a model's own painted dials; `console` adds a tunnel where a model has none.
- `textures` — base-colour and other texture sizes. Textures whose alpha is used stay PNG.

Decimation is error-driven: the script finds the smallest error, in metres, that brings the car under
95,000 triangles, so dense small parts collapse before broad panels lose their shape.

The script's tools are not project dependencies; install them without saving, then run it:

```sh
npm i --no-save --no-package-lock @gltf-transform/core@4 @gltf-transform/functions@4 \
    @gltf-transform/extensions@4 meshoptimizer@0 sharp@0
node scripts/import-car.mjs porsche
node scripts/import-car.mjs ferrari
npm run assets && npm run check
```

To edit a car by hand, open its source GLB in Blender (File → Import → glTF 2.0), make the change,
export it back over the source as GLB, and run the import again. Edits to `cabin.glb` itself are
overwritten by the next import.

## Delivery

| Car | Triangles | Mesh primitives | GLB | Decimation error |
| --- | ---: | ---: | ---: | ---: |
| Porsche 911 Turbo | 93,453 | 19 | 4.8 MB | 0.7 mm |
| Ferrari Testarossa | 93,366 | 32 | 5.8 MB | 2.8 mm |

The budgets are 100,000 triangles, 50 primitives and 8 MiB per car (`tests/cabinAsset.test.js`).

## Contract

Export glTF 2.0 as a self-contained, uncompressed GLB. Use metres, X right, Y up, and forward along -Z in the exported asset. The origin is the driver's longitudinal eye position at road height. Apply object scale before export; keep animation pivots as separate named nodes with their neutral orientation intact.

The runtime requires unique nodes named `driver_eye`, `mirror_camera`, `steering_wheel`, `gear_lever`, `instrument_surface`, `trip_surface`, `mirror_surface`, `windshield_surface`, and `radar_led_0` through `radar_led_5`. The four surfaces must be UV-mapped meshes. Surface UVs cover the full image, using standard glTF image coordinates (the exported top edge is V=0). The wheel rotates around its local Z axis; the lever tilts around its local X and Z axes. The mirror camera points backwards along the car's +Z axis. The driver camera is attached to `driver_eye` and stays seated.

The cluster, trip display, mirror picture, windshield cracks, and radar illumination are runtime-owned. Do not bake speed, gear, warnings, or other changing text into textures. Static materials and textures belong to the cached asset; runtime textures and material overrides belong to each cabin instance. Cabin teardown must not dispose cached geometry or materials, or the shared mirror render target.

The runtime loads the path declared in `car.cockpit.model`. A missing or invalid configured model is an error, not a reason to silently substitute procedural geometry.

## Acceptance

- Assets validate, load once, and survive stage changes and repeated car selection.
- Wheel, lever, instruments, trip display, mirror, radar, and windshield damage respond to game state.
- Seated yaw and pitch controls work while driving, stay bounded, and return to forward view.
- All interior viewpoints are inspectable in the asset preview and in-game.
- Repository checks pass; performance and browser evidence are recorded before handover.

## Inspecting and verifying

Run `npm start`, then open `http://localhost:8080/preview.html`. URL parameters select the car, lighting stage, and initial view; for example `preview.html?car=porsche&stage=4&view=rear`. In both the game and preview, keys 1–7 select dashboard, console, driver door, passenger door, front seats, roof, and rear cabin. Q/E rotate horizontally, R/F rotate vertically, C centres, and dragging adjusts both axes. The gamepad right stick looks around; its press centres. The preview also supports live steering, A/Z shifting, up-arrow revving, and keys 8/9 toggling radar and windshield damage.

`npm run browser` uses Playwright to exercise the real renderer, export all seven seated views under midday and sunset lighting, check cache ownership and controls, and measure rendering. It rejects unexpected console errors, including caught loading failures. It also starts real Firefox and tests versionless, major-only, and conventional Firefox user-agent strings in Chromium. It requires a running game server and Playwright as a development tool. A temporary tool install is sufficient:

```sh
npm install --prefix /tmp/test-drive-tools --no-save playwright@1.64.0
node /tmp/test-drive-tools/node_modules/playwright/cli.js install chromium firefox
PLAYWRIGHT_MODULE=/tmp/test-drive-tools/node_modules/playwright/index.mjs npm run browser
```

`GAME_URL` changes the server URL and `CABIN_EVIDENCE` changes the default `/tmp/test-drive-cabin-evidence` output directory. Browser verification uses the actual pinned three.js CDN modules. Screenshots and benchmark results are evidence, not game assets. `BROWSER_BIN` optionally selects an existing Chromium installation. `CABIN_REGRESSION_ONLY=1` runs the shorter loading/rendering matrix.
