# Test Drive 1987 — web remake

A fan remake of Accolade's 1987 *Test Drive* for the browser, rebuilt with a real 3D world,
real-car physics and synthesised engine sound, while keeping the original's soul: five exotic cars,
a mountain road with a rock face on one side and a drop on the other, trucks, radar traps, patrol
cars and a gas station at the end of every stage. The road is the one the Vancouver developers
drove: the Sea-to-Sky Highway, northbound from Horseshoe Bay along Howe Sound to Squamish.

> **Status: playable, being polished.** Title, car brochure, all five stages, gas station,
> results and high scores work end to end. All five cars are full 3D models, driven from inside
> their own cabins.

### Done

- `src/sim/`: drivetrain (calibrated to each car's 0-60 and top speed), tyre/vehicle dynamics,
  stages laid on the real road (rock face right, drop left), traffic, radar traps and pursuit,
  scoring. Tested.
- The Sea-to-Sky Highway (BC 99): the five stages are consecutive 8.6 km legs of the real road
  northbound, Horseshoe Bay, Lions Bay, Porteau Cove, Britannia Beach and Squamish, with its real
  bends, gradients and terrain (Howe Sound on the left, the Coast Mountains on the right). The drop
  falls to the real shore or sea floor under the water. `scripts/import-route.mjs` builds
  `src/data/seaToSky.js` from OpenStreetMap and Natural Resources Canada elevation data.
- Sea-to-Sky light: the late-afternoon sun stands at its real compass position in the west, on
  the left as you drive north, sinking stage by stage and glinting off the water as the road turns.
- Over the edge into Howe Sound: the car splashes in, floats while the water pours in, then sinks
  to the bottom (the heavy end first) as its air bubbles out; the camera follows it under, where
  fish circle the wreck. The notice says how far it fell and how deep it sank.
- Phones: touch buttons in landscape and (in two rows) portrait, every prompt in touch words
  ("Tap to start", "tap + to shift up"), the high-score name typed in the phone's own text box,
  and the 3D view drawn at no more than twice the screen's size in pixels. Checked on an emulated
  Pixel 7; frame rates on real phones are still to be measured.
- `src/audio/`: `AudioManager`, per-car engine synthesiser (AudioWorklet), sound bank, soundscape.
- `src/world/`: three.js world: road, cliff, drop, terrain, trees, props, vehicles, sky lighting.
- `src/world/cabin/`: the 3D cabin carried along at the car's pose: padded dash and hood, the
  instrument cluster (painted live from `src/cockpit/clusters.js`) behind real pods, steering
  wheel, shifter, pillars, doors, seats, radar detector, a real rear-view mirror, the bonnet and
  wings seen over the dash. Drawn in its own pass with its own sun and shadows.
- `src/cockpit/`: readings, sprung needles and gear knob (`CockpitState`), the driver's head
  (`HeadMotion`: leans in bends, nods under braking, road buzz, crash jolt, looking around), hands
  and feet (`DriverMotion`) and their limbs (`driverPose`, two-bone reach from the seat).
- `src/ui/screens/`: title, brochure with the acceleration graph, driving, gas station, results.
- The outside camera (V, the gamepad's left-stick press, or ◫ on touch): above and behind the car,
  with speed, revs (amber near the redline, red past it, while the engine wears towards blowing up),
  gear, and boost in psi on the turbo cars. From the driver's seat the gear is always shown bottom
  left.
- Crashes play out instead of freezing, watched from beside the road: hitting a car throws both
  apart as rigid bodies sharing the momentum by mass (the lighter one rides up and flies, the 12 t
  refuse truck barely moves), off-centre hits spin them, the rock face pushes the car back and the
  drop takes it; every hard hit cracks the windshield again, up to shattered. ENTER skips ahead.
- Working door mirrors on every car (the Porsche has the driver's only, as the model does): each
  shows the lane behind, just past the car's flank.
- A visible driver, as in Wing Commander (1990): gloved hands on the wheel at quarter to three,
  turning with it; on every shift the gear-side hand goes to the knob (the left one in the
  right-hand-drive Lotus), the lever moves only once it is there, and the left foot works the
  clutch; the right foot moves between throttle and brake. From outside the whole driver shows.

### Next (queued, in order)

1. **The cars you drive, as in reality:** each car's real engine sound. The gearing, weights,
   grip, turbo lag and boost are already the real cars'; no freely licensed recordings of these
   five exact cars exist (only stand-ins: a 911 of unknown year, a Murcielago V12, a Saab turbo
   four, a Corvette of unknown generation), so the engines stay synthesised until recordings
   with usable rights are found. Drop them in `assets/audio/engines/` (see its README).
2. **Sea-to-Sky polish:** the road as it is, from BC's 1 m LiDAR elevation (LidarBC) and the
   provincial Digital Road Atlas: the real blasted granite cuts and cliffs, concrete barriers, the
   railway between road and shore, Lions Bay, the islands across the sound; one polished 500 m
   section first, rock assets from Poly Haven (CC0).
3. Frame rates on real phones (the cabin pass, the mirrors, shadows).

## Play it

**https://shay-te.github.io/test-drive-1987/**: published from `master` by
`.github/workflows/pages.yml` (into the `gh-pages` branch) after the tests pass.

## Run it

```sh
npm start          # serves the folder on http://localhost:8080
```

Any static web server works; no build step. three.js 0.180.0 is loaded from jsDelivr.

## Controls (as on the 1987 PC version)

| Key | Action |
| --- | --- |
| ← → | steer |
| ↑ / ↓ | accelerate / brake |
| A / Z | shift up / down (you start in neutral) |
| Drag or Q / E | look left / right (view stays where you leave it) |
| R / F | look up / down |
| C | return to forward view |
| 1–7 | inspect dashboard, console, doors, seats, roof and rear cabin |
| V | outside view (above and behind the car) / driver's seat |
| I | digital mph / rpm readout |
| M | mute, P pause |

Gamepads (standard mapping) and touch controls work too. The right stick looks around; press it to centre the view. Drag on the world canvas to look on touch devices while the buttons control driving. Looking around also works while paused.

## Cabin assets

Every car, the traffic, the patrol car and the gas station are Sketchfab models by their authors, credited with their licences in [assets/models/README.md](assets/models/README.md); two (the Countach and the 1968 Beetle) are CC BY-NC-SA 4.0, non-commercial. `scripts/import-car.mjs` converts the player cars into cabins with live instruments, animated controls and a seated camera. Inspect them at [preview.html](preview.html); use keys 1–7 for repeatable interior viewpoints. See [the import pipeline, credits and asset contract](assets/models/README.md) before changing a model.

## The cars

Porsche 911 Turbo, Ferrari Testarossa, Lamborghini Countach 5000 QV, Lotus Esprit Turbo and
Chevrolet Corvette. Each uses its real gear ratios, final drive, tyre size, weight and torque
curve; the simulation self-calibrates to the published 0-60 mph time and top speed.
Choose with ◀ ▶ on the title screen or in the brochure. The title shows a car with an authored
model as a side-on photo of that model; cars without one are marked LOCKED and cannot be driven yet.

## Engine sound

Every engine is synthesised from its layout: firing order, cylinder banks, exhaust resonances and,
for the Porsche and Lotus, the turbo. If you own recordings of the real cars you can drop them in
`assets/audio/engines/` (see the README there) and the game cross-fades them by rpm instead.

## Development

```sh
npm test           # simulation tests (Node)
npm run check      # lint + duplication + orphan check + tests
```

Rules for contributors (and coding agents) are in [AGENTS.md](AGENTS.md).

## Credits

A non-commercial tribute to *Test Drive* by Distinctive Software, published by Accolade (1987).
Car names are trademarks of their respective owners; this project is not affiliated with them.

The road: © OpenStreetMap contributors. `src/data/seaToSky.js` is derived from OpenStreetMap
and is available under the Open Database License (ODbL). Heights: the Canadian Digital Elevation
Model, Natural Resources Canada (Open Government Licence – Canada), via the Mapzen/AWS Terrain
Tiles.
