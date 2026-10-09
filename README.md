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

- `src/sim/`: drivetrain (fitted to each car's road test: 0-60, 0-100, quarter mile and top
  speed), tyre/vehicle dynamics,
  stages laid on the real road (rock face right, drop left), traffic, radar traps and pursuit,
  scoring. Tested.
- The Sea-to-Sky Highway (BC 99): the five stages are consecutive 8.6 km legs of the real road
  northbound, Horseshoe Bay, Lions Bay, Porteau Cove, Britannia Beach and Squamish, with its real
  bends, gradients and terrain (Howe Sound on the left, the Coast Mountains on the right).
  `scripts/import-route.mjs` builds `src/data/seaToSky.js` from OpenStreetMap and British
  Columbia's 1 m LiDAR survey (LidarBC), with Natural Resources Canada's elevation model beyond it.
- The roadside as it is: the road's rise and fall from the 1 m LiDAR, carried straight over the 21
  mapped bridges; the rock face is the real blasted cut (tall where the mountain was cut away, a low
  bank where the side is flat) with the real mountainside above it, and the drop is the real slope
  down to the shore. Today's highway is a divided four-lane road; the game keeps the old two-lane
  road and hangs the real slopes off its edges. The sea floor shelves away from the shore. The
  rock is photographed (Poly Haven, CC0; `scripts/import-texture.mjs`): cracked rock greyed to
  granite for the cuts and the boulders fallen from them, lichen-grown rock wherever a natural slope
  is too steep to hold soil. Rock is laid along the world's axes (biplanar mapping), so it never
  stretches up a cliff, and no photograph shows a repeating tile.
- All the land around, as it was in 1987: the real terrain out to about 35 km (Howe Sound's
  islands, the ranges either side, the peaks and glaciers to the north) in the colours the Landsat 5
  satellite saw on 5 September 1987 (`scripts/import-landsat.mjs`), with the same picture on the
  ground beside the road and down the drop, sharpened close up by a real aerial photograph of
  mossy, rocky ground (Poly Haven, CC0). The view reaches 45 km through a thin coastal haze.
- The real buildings: every one OpenStreetMap has within 400 m of the highway (Horseshoe Bay,
  Lions Bay, Britannia Beach with its stepped mill, Squamish) stands on its footprint, with walls
  from its storeys, a gable or pyramid roof on houses and flat roofs stepping up the hillside on
  the rest (`scripts/import-buildings.mjs`).
- The railway: BC Rail's line to Squamish as OpenStreetMap has it, out of its tunnels, on its ballast
  bed (ties and standard-gauge rails) along the real ground, on fill above the water along the
  shore and on steel girders over its bridges (`scripts/import-railway.mjs`).
- The coastal forest as surveyed for the Lions Bay wildfire plan (B.A. Blackwell & Associates,
  2007): Coastal Western Hemlock forest, over 80% conifer. Stands of mature Douglas-fir, western
  hemlock, western redcedar and amabilis fir 30 to 40 m tall with their crowns high up, younger
  stands of 20 to 33 m, red alder stands (more of them on the road's disturbed edge) and mixed
  stands with bigleaf maple, amabilis fir and hemlock above 900 m. Each species is drawn as it grows:
  the fir's upturned branch tips, the hemlock's drooping leader, the cedar's flared red trunk and
  J-shaped branches, the alder's pale trunk and small ovate leaves, the maple's mossy trunk, broad
  crown and big five-lobed leaves; a broadleaf crown is limbs forking from the trunk, branches out
  to its edge and leafy sprays hanging from them. The canopy trees are drawn (50 a hectare by the
  road), never on bare rock, above the tree line or inside a building; within 260 m of the car tree
  by tree, beyond as crossed silhouette cards. Close to the road the ground is a coastal pine-forest floor (Poly Haven, CC0).
- Guard rail as engineers place it: wherever the real ground 6 m beyond the edge lies 3 m or more
  below the road (from the LiDAR), runs joined across short gaps and carried on into turned-down
  ends. It is a 1980s galvanised W-beam, its two corrugations 0.69 m up, on timber posts with
  blockouts every 1.905 m. A car brushing it scrapes along, a glancing hit wrecks against it, and
  a hard one goes through it and over the edge.
- The cut is blasted granite: blocks a couple of metres across, each set back by its own amount,
  dark joints between them, at about a metre's detail.
- Stages load in the background: from the moment the title screen shows, a worker lays out the
  first stage's road and ground while its models and pictures download, and each stage prepares
  the next while it is driven. Starting a stage only waits for that work, then compiles the stage's
  shaders ahead (in parallel where the browser can) so the first frame does not stall.
- Sea-to-Sky light: the late-afternoon sun stands at its real compass position in the west, on
  the left as you drive north, sinking stage by stage and glinting off the water as the road turns.
- Over the edge into Howe Sound: the car tumbles down the real slope, sliding on over the wet
  undergrowth wherever it is steep (it stops on a bench, or against a tree, as a real car would),
  and where the slope runs down to the water it splashes in, floats while the water pours in, then
  sinks to the bottom (the heavy end first) as its air bubbles out; the camera follows it under,
  where fish circle the wreck. The notice says how far it fell and how deep it sank.
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
  with the rear-view mirror shown at the top of the screen,
  with speed, revs (amber near the redline, red past it, while the engine wears towards blowing up),
  gear, and boost in psi on the turbo cars. From the driver's seat the gear is always shown bottom
  left.
- Crashes play out instead of freezing, watched from beside the road: hitting a car throws both
  apart as rigid bodies sharing the momentum by mass (the lighter one rides up and flies, the 12 t
  refuse truck barely moves), off-centre hits spin them, the rock face pushes the car back and the
  drop takes it; every hard hit cracks the windshield again, up to shattered. Nothing is a ghost:
  the trees' trunks stop a car, the wrecks hit each other again, and a car flung into another car
  (or one driving on into the wreck) joins it, so one crash sets off the next. ENTER skips ahead.
- Working door mirrors on every car (the Porsche has the driver's only, as the model does): each
  shows the lane behind, just past the car's flank.
- A visible driver, as in Wing Commander (1990): rigged gloved hands (a skinned hand model posed
  joint by joint) on the wheel at quarter to three, every finger and the thumb closed round the rim
  (and round the gear knob through a shift), turning with it; on every shift the gear-side hand
  goes to the knob, to where the real car keeps that gear (the 930's four-speed H, the dog-leg
  first of the Testarossa and Countach, the Esprit's H with fifth up on the right, the Corvette's
  4+3), the lever moves only once it
  is there, and the left foot works the clutch; the right foot moves between throttle and brake.
  From outside the whole driver shows.

- Police as in British Columbia in 1987-89 (the B.C. Police Commission's 1982 pursuit guidelines and
  its 1990 report "Police Pursuit in British Columbia"; Motor Vehicle Act s. 67): clocked by a
  radar trap, the RCMP patrol car pulls out with lights and siren. Stop for it and you get a
  speeding ticket (time lost). Drive on and you have failed to stop: the officer follows (never
  boxing you in or ramming), radios for assistance, and a roadblock of patrol cars goes up across
  the road ahead, at a place you can see in time to stop at your speed. Stopping then, at the
  roadblock, or arriving at the gas station with him still behind you is an arrest: jail, and the
  game is over. Turn back (a U-turn, or a three-point turn in reverse on the narrow highway) and he
  stops, turns round and follows, and the roadblock's officers redeploy ahead of you, the way you
  are now going. Get far enough ahead and he breaks off the chase: a roadblock already up stays,
  none is set up after. No helicopters (not used for general policing then) and no spike belts (not
  in the guidelines).

- Reverse and turning round: each car's real reverse gear (the 930/36's 2.44, the Testarossa's
  2.52, the Countach's 1.96, the Esprit's Citroën 3.15, the Corvette's 2.78), down from neutral and
  only at a standstill, the knob going where the real car's R is (left of first and forward on the
  930 and the Corvette, above the dog-leg first on the Testarossa and Countach, back from fifth on
  the Esprit). The car turns through any heading, so it can U-turn or three-point turn on the
  narrow highway and drive back down it, keeping right, with traffic on the road ahead of it;
  back past the start line it is turned round.

- A blown engine smokes: grey smoke pours from where the engine sits (the 930's tail, the
  Corvette's bonnet, behind the seats of the mid-engined cars), rising, drifting with the wind,
  swelling and thinning out, until the car is sent back on the road.

- The forest floor by the road: patches of sword fern (fronds arching from the crown) and salal
  (low leafy shrubs) on the ground beside the road, as the Lions Bay plan describes the understory,
  drawn within 120 m of the car; foliage keeps its cover at a distance (alpha raised with the mip
  level) instead of thinning to specks.

- "TEST DRIVE" on the car's licence plates, as British Columbia issued them from 1985: blue on
  reflective white, BRITISH COLUMBIA above and BEAUTIFUL below, the provincial flag between the
  serial's halves; in each model's own plate recess, front and rear where the car has both.

### Next (queued, in order)

1. **A 1980s RCMP patrol car** in place of the 2001 Crown Victoria model.
2. **Every stage inspected section by section** for anything that does not look real.
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
| A / Z | shift up / down (you start in neutral; down from neutral at a standstill is reverse) |
| ↓ + ↑ at a standstill | launch as road testers did: the brake holds the car while the revs and the boost build against the clutch; let go of ↓ |
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
curve; the simulation fits itself to the brochure's road test as US magazines ran it (clock
started after a one-foot rollout, the tester's quickest launch revs, shifts at the redline): 0-60,
0-100, the quarter mile and its trap speed, and the top speed. The fit runs on the same tyres the car
drives on (`TYRES` in `src/config.js`), so a launch like the tester's does the brochure's times;
floored from idle a turbo car first waits for its boost, and the first stage starts up the hill out
of Horseshoe Bay. The acceleration graph in the
brochure is that simulated run.
Choose with ◀ ▶ on the title screen or in the brochure. The title shows a car with an authored
model as a side-on photo of that model; cars without one are marked LOCKED and cannot be driven yet.

## Engine sound

Every car plays real recordings of its engine: seamless loops cut by `scripts/import-engine.mjs`
from openly licensed videos and sounds (YouTube's Creative Commons Attribution, Freesound's CC0),
cross-faded by rpm and load. The 930 Turbo, Testarossa, Countach and C4 Corvette are their own
cars; the Esprit is its later S4s (same engine family), and a few rpm bands are filled from
related engines (see [assets/audio/engines/README.md](assets/audio/engines/README.md)). Above the
highest recording, which would otherwise only be pitched up, the engine synthesiser (firing order,
cylinder banks, exhaust resonances, turbo) takes over. A crash stalls the engine.

Crashes are recorded too (CC0, cut by `scripts/import-sounds.mjs`): a real crash for the first
impact, metal knocks as a wreck tumbles (only for a fresh, hard knock, never every time it touches
the ground), and a windshield cracking each time the glass does.

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
and is available under the Open Database License (ODbL). Heights: contains information licensed
under the Open Government Licence – British Columbia (LidarBC); and the Canadian Digital
Elevation Model, Natural Resources Canada (Open Government Licence – Canada), via the Mapzen/AWS
Terrain Tiles. The land's colour: Landsat 5 imagery of 5 September and 10 July 1987, courtesy of
the U.S. Geological Survey / NASA (public domain), read from Microsoft's Planetary Computer.
Rock and ground textures: Poly Haven (CC0) — Rock Face 03 by Dario Barresi and Rico Cilliers,
Lichen Rock and Aerial Rocks 04 by Rico Cilliers, Forest Ground 04 by Rob Tuytel. The buildings and the railway: © OpenStreetMap
contributors; `assets/terrain/sea-to-sky/buildings.json` and `railway.json` are derived from
OpenStreetMap and available under the ODbL. Engine recordings (CC BY 3.0 unless marked): Seppe Vanrolleghem (Porsche 930 Turbo),
NelloRacing (RUF CTR), Jason #jcr_cars (Ferrari Testarossa), automobilemusicengines (Lamborghini
Countach LP500S), cheesepuff on Freesound (CC0), Thomas Fletcher (Lotus Esprit S4s), LUNI Classic
Cars (Chevrolet Corvette C4); titles and links in `assets/audio/engines/README.md`. Crash sounds
(Freesound, CC0): magnuswaker, softwalls, squareal, LPA134, craigsmith and Sanderboah (titles in
`scripts/import-sounds.mjs`). The driver's hands: the generic hand of the W3C Immersive Web WebXR Input Profiles
(`@webxr-input-profiles/assets`, MIT licence).
