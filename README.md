# Test Drive 1987 — web remake

A fan remake of Accolade's 1987 *Test Drive* for the browser, rebuilt with a real 3D world,
real-car physics and synthesised engine sound, while keeping the original's soul: five exotic cars,
a mountain road with a rock face on one side and a sheer drop on the other, trucks, radar traps,
patrol cars and a gas station at the end of every stage.

> **Status: playable, being polished.** Title, car brochure, all five stages, gas station,
> results and high scores work end to end. You sit in a real 3D cabin (the Porsche 930's is
> modelled from an owner photo and the factory blueprint); the other cars use the same cabin with
> their own instruments, wheel and shifter until they get their own.

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

### Next

1. Model the other four cabins (Testarossa, Countach, Esprit, C4) like the 930's.
2. Tune the cabin materials and lighting against the reference photos; handling feedback pass.
3. Test on phones (touch controls, performance of the cabin pass).

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
| Q / E | look left / right |
| I | digital mph / rpm readout |
| M | mute, P pause |

Gamepads (standard mapping) and touch controls work too.

## The cars

Porsche 911 Turbo, Ferrari Testarossa, Lamborghini Countach 5000 QV, Lotus Esprit Turbo and
Chevrolet Corvette. Each uses its real gear ratios, final drive, tyre size, weight and torque
curve; the simulation self-calibrates to the published 0-60 mph time and top speed.

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
