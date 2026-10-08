# Test Drive 1987 — web remake

A fan remake of Accolade's 1987 *Test Drive* for the browser, rebuilt with a real 3D world,
real-car physics and synthesised engine sound, while keeping the original's soul: five exotic cars,
a mountain road with a rock face on one side and a sheer drop on the other, trucks, radar traps,
patrol cars and a gas station at the end of every stage.

> **Status: work in progress.** The simulation, audio and 3D world are in place; the cockpits,
> menus and game loop are being built.

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
