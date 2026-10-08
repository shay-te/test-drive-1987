# Agent Rules — Test Drive 1987 (web remake)

A browser remake of Accolade's 1987 *Test Drive*: vanilla ES modules, three.js 0.180.0 (pinned in
the `index.html` import map) for the 3D world, Canvas 2D for the cockpit and menus, Web Audio for
sound. No build step: `npm start` serves the folder.

## Git

- **Do not run `git add`, `git commit` or `git push`.** Prepare the changes and stop; the user
  inspects them and decides when to stage or commit.
- No destructive git commands (`reset --hard`, `checkout --`, `clean`, force pushes).
- Don't run `git diff` / `git status` reflexively. Use git history only when you need it
  (`git log --follow`, `git show <commit>:<path>`, `git blame`).

## Hard rules

- **Do not write code that already exists — search before writing.** Before adding any helper,
  constant, class or method, `rg` for an existing one and reuse it. Duplicated logic and orphaned
  (uncalled) code are both defects.
- **One concept, one name across the codebase.** The rock face is `wall` everywhere, a radar trap
  is a `trap`, a life is a `chance`, a road position is `(s, u)`. Never mix synonyms.
- **No shim / barrel files.** No `index.js` re-exports; import from the real module.
- **No magic numbers.** Physics/game tunables live in `src/config.js`, per-car and per-stage data
  in `src/data/`, shared UI colours and fonts in `src/ui/theme.js`. Reuse the nearest existing
  token before adding a new one.
- **All player-facing text lives in `src/i18n/en.js`** and is read with `t(key)` from
  `src/i18n/i18n.js`. Never write a UI string inside a screen, cockpit or renderer.

### No redundancy — checks to run before you finish

- `npm run lint` — ESLint: unused imports/variables, arrow-body style, `no-undef`.
- `npm run dedup` — jscpd. The gate fails above 0.3% duplication; any new clone is a regression.
- `npm run orphans` — exported symbols with no importer. An orphan is dead code: delete it
  (and its dedicated test) unless it is an entry point.
- `npm test` — the Node test suite.
- `npm run check` runs all four. A task is not finished until it is green.

## Architecture

- `src/main.js` is **composition only**: it builds the managers and hands them to `Game`. No
  logic, templates or parsing there — new features add constructor calls, nothing else.
- Managers own one concern each and are injected through constructors:
  `ResourceManager` (assets, textures, fonts, audio buffers), `AudioManager` (Web Audio graph,
  buses, engine sound, sound effects), `InputManager` (keyboard, gamepad, touch).
- **Simulation (`src/sim/`) is pure and renderer-free**: no DOM, no three.js, no audio. It must
  run in Node so it can be tested.
- **Renderers draw; they do not decide.** World, cockpit and screen code only render state.
  Computations (gauge angle mapping, scoring, radar strength, lap timing) live in sim modules or
  helpers next to the feature, where they can be unit-tested without a canvas.
- **Generic primitives don't know domain concepts.** A gauge takes `value`, `min`, `max`; the
  per-car cluster layout decides that it shows speed. Compose instead of adding domain props.
- **Don't rebuild data — extend it.** Pass the car/stage objects from `src/data/` as they are;
  if something needs an extra field, spread the original and add only that field.
- Give each class a one-line responsibility comment. If it describes two jobs, split the class.
- Shared helpers go in `src/util/` (pure) — named for what they do (`math.js`, `color.js`,
  `canvas.js`). Feature-specific helpers live next to the feature.

## Required behavior

- Read the full task context before changing code.
- Prefer small, direct changes over broad refactors; keep the existing structure and naming.
- Do not add dependencies unless clearly required. three.js is the only runtime dependency; dev
  tools run via `npx`.
- Configuration-driven behaviour lives in `src/config.js`, not hard-coded at call sites.

## Testing

- **Real data, real tests — mocks are the last resort.** Tests run the actual simulation:
  build a real stage with `buildTrack`, drive a real `VehicleDynamics`, calibrate a real
  `Drivetrain`. Only stub a boundary that genuinely cannot run in Node (Web Audio, WebGL).
- Write tests for new behaviour; prefer focused tests close to the changed module.
- A bug fix ships with a regression test that fails on the old code and passes on the new.
- If anything feels under-tested — a new branch, a fallback, an interaction — add the test.
- No test bootstrap shims or fake package injectors.
- If tests fail, fix the code or the tests and rerun until they pass. Never skip or disable a test.

## Safety

- Do not remove user code unless it is part of the requested change.
- Keep logging clear on any swallowed exception or degraded path (e.g. a missing optional
  engine recording falls back to the synthesiser and says so in the console).
- Required runtime pieces fail fast; don't hide a missing dependency behind a silent fallback.
- No thin wrappers around three.js or Web Audio calls unless they add real domain behaviour.

## Output

- Keep code readable; reuse existing utilities.
- In reports, separate what was **observed** (code, logs, tests), what is **inferred**, and what
  is **planned**. Don't call something fixed or validated before it has actually been verified.

## Code style

- Clarity over cleverness, explicit structure over magic, small reusable helpers over
  duplication, no magic numbers.
- **4-space indentation** in every file you create (`.js`, `.css`, `.html`). Don't reformat
  existing files; diffs show only the change that was made.
- **Arrow functions always use braces and an explicit `return`** (enforced by `arrow-body-style`):

  ```js
  // Bad
  const lerp = (a, b, t) => a + (b - a) * t;
  // Good
  const lerp = (a, b, t) => {
      return a + (b - a) * t;
  };
  ```

- **Comments: max 2 lines**, only when the *why* is non-obvious. No essays.
- A module named after a class exports that class: `VehicleDynamics.js` → `class VehicleDynamics`.
  Function modules use camelCase file names.
- Extract repeated values (paths, colours, strings) into constants and repeated steps into
  helpers. When deduplicating, preserve behaviour and visible output.

## i18n

- Strings live in `src/i18n/en.js`. **Single words go under `general.*`**; check `general` before
  adding a word anywhere else. Multi-word phrases use specific, context-based keys
  (`station.refuelling`, `crash.overTheEdge`). Enum-like labels go under `enums.<name>.<member>`.
- Don't duplicate a translation that already exists; remove keys that are no longer used.
- If a second locale is added, every locale file is line-aligned to `en.js`.

## Tool preferences

- Use `rg` for all searches, scoped: `rg "pattern" src/ --type js -l`. Search first; read a file
  only if you must edit it.
- Single-line edits/deletions: `sed -i`. Don't read whole files to find one key.
- Plan before acting; make the smallest change that does the job; don't touch unrelated lines.
