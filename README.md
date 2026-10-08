# Test Drive 1987 — web remake

A fan remake of Accolade's 1987 *Test Drive* for the browser, rebuilt with a real 3D world,
real-car physics and synthesised engine sound, while keeping the original's soul: five exotic cars,
a mountain road with a rock face on one side and a sheer drop on the other, trucks, radar traps,
patrol cars and a gas station at the end of every stage.

> **Status: work in progress.** The simulation, audio and 3D world are in place; the cockpits,
> menus and game loop are being built.

### Done

- `src/sim/`: drivetrain (calibrated to each car's 0-60 and top speed), tyre/vehicle dynamics,
  procedural stages (rock face right, drop left), traffic, radar traps and pursuit, scoring. Tested.
- `src/audio/`: `AudioManager`, per-car engine synthesiser (AudioWorklet), sound bank, soundscape.
- `src/world/`: three.js world: road, cliff, drop, terrain, trees, props, vehicles, sky lighting,
  rear-view mirror (`WorldView`).
- `src/cockpit/`: instrument readings, gauge drawing primitives, per-car cluster layouts
  (`clusters.js`; the Lotus layout is the one in the original game's screenshot).

### Next

1. `src/cockpit/Cockpit.js`: draw the interior over the 3D view: visor with radar detector,
   mirror frame, dash and cowl, clusters from `clusters.js`, rotating "TD" steering wheel,
   animated H-pattern gear lever, trip computer, windshield cracks on a crash.
2. Screens in `src/ui/screens/`: title, car-select brochure (side-view art and an acceleration
   graph from `Drivetrain.simulateLaunch`), driving, gas station, results and high scores.
3. `src/core/Game.js` (loop and screen switching) and `src/main.js` (composition only).
4. Browser test pass in headless Chromium, then tune visuals and handling.

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
| D | show / hide the gear lever |
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
