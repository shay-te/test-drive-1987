# Car models and cabin assets

All five cars are driven from the inside of full 3D models: each `cabin.glb` holds the complete car,
exterior and interior, plus the parts the game animates and draws on. The title screen and the
brochure photograph the same file side-on. A car whose `cockpit.model` is missing is shown locked.
The Lotus model is a right-hand-drive car, so its driver sits on the right.

## Sources and credits

| Car | Source model | Author | License |
| --- | --- | --- | --- |
| Porsche 911 Turbo | [Porsche 911 turbo 930 Johnny Silverhand's](https://sketchfab.com/3d-models/porsche-911-turbo-930-johnny-silverhands-25656a7a831442059de7a466f4a17692) | valvetin | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Ferrari Testarossa | [1986 Ferrari Testarossa](https://sketchfab.com/3d-models/1986-ferrari-testarossa-36865e4d4d21482bb268520aafca1196) | Res1n | Sketchfab Standard |
| Lamborghini Countach | [1985 Lamborghini Countach LP5000 QV](https://sketchfab.com/3d-models/1985-lamborghini-countach-lp5000-qv-1bd6795f12ea4476bf8afe1b3d988ed7) | OUTPISTON | [CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Lotus Esprit Turbo | [Lotus Esprit Turbo 1983](https://sketchfab.com/3d-models/lotus-esprit-turbo-1983-886bcf8ce52f46e3b36115e01319ec44) | esprit3d.website | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Chevrolet Corvette | [Chevrolet Corvette C4](https://sketchfab.com/3d-models/chevrolet-corvette-c4-944ec751e0334d58b249cb983147e7e9) | Randomness | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Police car (traffic) | [2001 Crown Victoria Police Interceptor Game Prop](https://sketchfab.com/3d-models/2001-crown-victoria-police-interceptor-game-prop-9f30d360cee343efb5a441978ddb57bd) | 8sianDude | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Gas station | [Lowpoly Gas Station](https://sketchfab.com/3d-models/lowpoly-gas-station-02a11319cb744999adddd7236a46bf8e) | AspectStudios | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |

The Countach model is non-commercial and share-alike: it and its derived `lamborghini/cabin.glb` stay
under CC BY-NC-SA 4.0, not the repository's MIT license.

The downloaded files are kept unchanged in each car's folder, next to `cabin.glb`. The game's
`cabin.glb` is derived from them: turned into game space, decimated, with hidden parts removed,
materials adjusted, and the runtime parts below added. The game loads only `cabin.glb`.

## Import pipeline

`scripts/import-car.mjs <carId>` turns `assets/models/<carId>/<source>.glb` into
`assets/models/<carId>/cabin.glb`, following `assets/models/<carId>/import.json`. Given a road-user id
from `src/data/traffic.js` instead (`police`), it writes `model.glb`: centred on the road at the
traffic length, decimated to `triangles`, with the light bar's lenses split by colour (`lights.node`)
into the meshes named by the type's `lightBar`, which the game flashes. Given a scenery id from
`src/data/scenery.js` (`station`), it also writes `model.glb`, scaled by `scale` and standing on
`ground` (in source units), centred; the station stands in each stage's finish pull-out and is
photographed with the player's car at its `bay` for the refuelling screen. The cabin options are:

- `yawDeg`, `centreOn` — turn the model nose-first along −z and centre it across. It is scaled to
  `body.length` from `src/data/cars.js`, put on the road, and moved so the nose is `body.eye` ahead of
  the seated eye (the origin).
- `remove`, `materials`, `translucent` — drop parts by node name, fix materials (alpha mode, colour,
  opacity, roughness; `transmission: false` swaps costly transmission glass for alpha blending;
  `as` merges a material into a look-alike, since every static material costs a draw call), and
  move a texture atlas's window parts onto a translucent copy.
- `normals.creaseDeg`, `pruneBelow` — for flat-shaded sources: weld by position and rebuild normals
  with that crease angle; drop loose pieces smaller than that many metres (tread blocks, tiny badges).
- `eye`, `steeringWheel`, `windshield` — the seated eye `[x, y]`; the wheel parts (their hub and axis
  are found from the geometry) and an optional material; the windshield node, or a box and facing
  that select its triangles from a larger glass mesh.
- `instrument`, `trip`, `mirror`, `radar`, `lever`, `console` — where the live dials, trip display,
  rear-view mirror, radar detector and gear lever sit (centre, facing normal, width).
  `instrument.backing` blanks a model's own painted dials; `mirror.housing: false` keeps a model's own
  mirror body; `lever.parts` hangs a model's own gear lever on the pivot instead of a generated one,
  or `lever.box` lifts it out of larger meshes by region; `console` adds a tunnel where a model has
  none.
- `textures` — base-colour and other texture sizes. Textures whose alpha is used stay PNG.

A mesh node named `Object_N` that is its parent's only child takes the parent's name, so configs can
use the names the modeller gave (`steering_152`). Specular-glossiness materials from older exporters
are converted to metal-roughness first. Decimation is error-driven: the script finds the smallest
error, in metres, that brings the car under 95,000 triangles, so dense small parts collapse before
broad panels lose their shape.

To edit a car by hand, open its source GLB in Blender (File → Import → glTF 2.0), make the change,
export it back over the source as GLB, and run the import again. Edits to `cabin.glb` itself are
overwritten by the next import.

## Tools

The model tools are not project dependencies. Install them into this repository without saving (one
command, so a later install does not prune the others), plus Playwright's browsers:

```sh
npm i --no-save --no-package-lock @gltf-transform/core@4 @gltf-transform/functions@4 \
    @gltf-transform/extensions@4 meshoptimizer@0 sharp@0 playwright@1.56.1
npx playwright install chromium firefox
```

Work files go to `tmp/` (ignored by git). The browser tools need `npm start` running.

- `node scripts/inspect-model.mjs <model.glb> [x0,y0,z0,x1,y1,z1]` — credit, materials, and every part
  with its triangles and bounds, largest first; a box keeps the parts centred inside it.
- `scripts/model-viewer.html?model=<path>&view=eye|side|top|front|back` — a studio view of any model:
  `eye`, `yaw`, `pitch` for a seated camera, `centre` and `zoom` for the orthographic ones, `hide` for
  parts or materials (three.js turns spaces in names into underscores).
- `node scripts/model-shots.mjs view <name> "<query>"` — screenshot the viewer to `tmp/shots/`.
- `node scripts/model-shots.mjs pick "<query>" x,y ...` — the part, material, point and normal under
  each pixel of that view: how the positions in `import.json` are measured.
- `node scripts/model-shots.mjs preview <carId> <view>[+keys] ...` — screenshot the game's own cabin
  preview with live displays (`forward`, or a view id from `src/data/cabinViews.js`; `+89` turns on
  the radar and the windshield damage).

## Adding a car

1. Put the download in `assets/models/<carId>/` and read its license with `inspect-model.mjs`.
2. Write `import.json` with `source` and `yawDeg` (find the nose and the steering wheel in the
   inspector's bounds; the wheel must end up at −x, on the left), then
   `node scripts/import-car.mjs <carId> --aligned tmp/<carId>-aligned.glb`.
3. Look at the cabin (`model-shots.mjs view` from above and from a guessed eye). If the seat is not
   where `body.eye` puts the eye, move `body.eye` in `src/data/cars.js` and realign; set `body.wheels`
   to the model's axles, since the over-the-edge physics uses both.
4. Measure the rest with `model-shots.mjs pick`: the gauge face, a place for the trip display, the
   mirror, a spot for the radar under the windshield, the lever base. Name the wheel, windshield and
   lever parts from the inspector.
5. Import (`node scripts/import-car.mjs <carId>`), point `cockpit.model` at the cabin, and run
   `npm run assets`. If the decimation error is more than a couple of millimetres, the source is
   probably flat-shaded: add `normals.creaseDeg`.
6. Check every seated view with `model-shots.mjs preview`, including `+89`, and fix what looks wrong:
   dark materials, see-through windows, a missing crack layer, clipped housings. A jagged glass edge
   means the windshield box cuts through a pane: end it in the gap before the next pane (bin the
   glass triangles' centres along the car to find it). Over 50 primitives: merge look-alike
   materials with `as`. Over 8 MiB: lower the `textures` sizes.
7. Add the car to the authored-cabin and unlocked-car lists in `tests/cabinAsset.test.js` and
   `tests/menus.test.js`, add its credit above, and run `npm run check`.

## Delivery

| Car | Triangles | Mesh primitives | GLB | Decimation error |
| --- | ---: | ---: | ---: | ---: |
| Porsche 911 Turbo | 93,453 | 20 | 4.8 MB | 0.7 mm |
| Ferrari Testarossa | 93,366 | 32 | 5.8 MB | 2.8 mm |
| Lamborghini Countach | 93,091 | 45 | 4.7 MB | 1.3 mm |
| Lotus Esprit Turbo | 93,073 | 34 | 4.9 MB | 1.8 mm |
| Chevrolet Corvette | 93,062 | 41 | 5.4 MB | 0.3 mm |
| Police car | 19,999 | 9 | 2.9 MB | 1.4 mm |
| Gas station | 19,996 | 5 | 1.2 MB | 8.3 mm |

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

`npm run browser` uses Playwright (installed as above) to exercise the real renderer, export all seven seated views under midday and sunset lighting, check cache ownership and controls, and measure rendering. It rejects unexpected console errors, including caught loading failures. It also starts real Firefox and tests versionless, major-only, and conventional Firefox user-agent strings in Chromium. It requires a running game server. The same check gates every GitHub Pages deploy (`.github/workflows/pages.yml`).

`GAME_URL` changes the server URL and `CABIN_EVIDENCE` changes the default `tmp/cabin-evidence` output directory. Browser verification uses the actual pinned three.js CDN modules. Screenshots and benchmark results are evidence, not game assets. `BROWSER_BIN` optionally selects an existing Chromium installation. `CABIN_REGRESSION_ONLY=1` runs the shorter loading/rendering matrix that the deploy runs. Playwright's Firefox does not launch on this macOS version, so locally only the Chromium part completes.
