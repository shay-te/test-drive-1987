# Test Drive 1987 — web remake

A fan remake of Accolade's 1987 *Test Drive* for the browser, rebuilt with a real 3D world,
real-car physics and synthesised engine sound, while keeping the original's soul: five exotic cars,
a mountain road with a rock face on one side and a sheer drop on the other, trucks, radar traps,
patrol cars and a gas station at the end of every stage.

> **Status: playable, being polished.** Title, car brochure, all five stages, gas station,
> results and high scores work end to end. All five cars are full 3D models, driven from inside
> their own cabins.

### Done

- `src/sim/`: drivetrain (calibrated to each car's 0-60 and top speed), tyre/vehicle dynamics,
  procedural stages (rock face right, drop left), traffic, radar traps and pursuit, scoring. Tested.
- `src/audio/`: `AudioManager`, per-car engine synthesiser (AudioWorklet), sound bank, soundscape.
- `src/world/`: three.js world: road, cliff, drop, terrain, trees, props, vehicles, sky lighting.
- `src/world/cabin/`: the 3D cabin carried along at the car's pose: padded dash and hood, the
  instrument cluster (painted live from `src/cockpit/clusters.js`) behind real pods, steering
  wheel, shifter, pillars, doors, seats, radar detector, a real rear-view mirror, the bonnet and
  wings seen over the dash. Drawn in its own pass with its own sun and shadows.
- `src/cockpit/`: readings, sprung needles and gear knob (`CockpitState`), the driver's head
  (`HeadMotion`: leans in bends, nods under braking, road buzz, crash jolt, looking around).
- `src/ui/screens/`: title, brochure with the acceleration graph, driving, gas station, results.
- The outside camera (V, the gamepad's left-stick press, or ◫ on touch): above and behind the car,
  with a speed and gear readout. From the driver's seat the gear is always shown bottom left.

### Next (queued, in order)

1. **The cars you drive, as in reality:** each car's real engine sound, its real turbo and rev
   behaviour, and handling that matches the real car; always show which gear you are in.
2. **Working side mirrors:** the door mirrors show the road behind, like the rear-view mirror.
3. **A visible driver, as in Wing Commander (1990):** hands on the wheel, feet working the clutch,
   brake and throttle, a hand moving to the gear lever on every shift.
4. **A Sea-to-Sky Highway setting:** the coastal road from Horseshoe Bay to Squamish above Howe
   Sound (one lane each way, cut into the cliffs; see the 1966 TranBC footage). Start with one
   polished 500 m section (bend, rock wall, drop, trees, distant mountains), then extend it; rock
   assets from Poly Haven (CC0), terrain from Natural Resources Canada elevation data.
5. **Sea-to-Sky lighting:** driving north, a late-afternoon summer sun in the west (to the left),
   and its glint on the water to the left, moving across the view as the road turns.
6. **Over the edge into the sea:** the car sinks, with fish and rising air bubbles.
7. Test on phones (touch controls, performance of the cabin pass).

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
