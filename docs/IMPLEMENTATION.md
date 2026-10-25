# Create Mod Modeler — Implementation plan

Companion to [DESIGN.md](DESIGN.md). Build order: **vertical slice first** (one chain working end to end and deployed), then breadth. The calculation core is built **test-first** (Vitest).

## Architecture

```
scripts/data/        Node build script: Create + vanilla sources → normalized data file
src/data/            generated data (create-6.0.10.json) + its TypeScript types
src/core/            pure TypeScript, no React
  model/             plan graph types, settings, (de)serialization with schema version
  formulas/          one module per machine, each citing its Create source file
  solver/            graph → linear program → rates, flows, shortage/surplus
  derive/            machine counts, utilisation, SU, burners/fuel, edge limits
src/ui/              React + React Flow (@xyflow/react) + Zustand store
.github/workflows/   ci.yml (lint, typecheck, test), deploy.yml (GitHub Pages)
```

Rule: `src/core` never imports from `src/ui`. Everything the UI shows is computed by `core` and covered by tests.

### Solver

One linear program per graph (library: `highs` WASM build, or `javascript-lp-solver` if the bundle size of HiGHS is a problem):

- variable per recipe node: rate `x ≥ 0` (recipe executions per minute)
- variable per edge: flow `f ≥ 0`; per port: slack variables `shortage ≥ 0`, `surplus ≥ 0`
- output port: `x · count · chance = Σ outgoing f + surplus`
- input port: `x · count = Σ incoming f + shortage`
- source node: fixed rate (equality) or unlimited; target node: fixed output rate
- optional fixed edge ratios as extra equalities
- objective: minimise shortage (large weight), then surplus

This gives demand-based distribution, cycle handling and infeasibility reporting in one place. Machine counts, SU and fuel are derived from `x` afterwards (they depend on RPM/stack size but don't feed back into the LP).

### Data file (normalized)

`items`, `fluids`, `recipes[]` with `{ id, type, machine, inputs[{ item|fluid, amount }], outputs[{ item|fluid, amount, chance }], processingTime, heat, derivedFrom? }`, `machines` (stress impact, formula key), `powerSources`, `fuels`, `meta` (Create version, MC version, source commit).

Sources (pinned):

- Create repo at the 6.0.10 release tag (sparse checkout): `src/generated/resources/data/create/recipe/**`, textures under `src/main/resources/assets/create/textures/**`
- vanilla 1.21.1 recipes and textures from [misode/mcmeta](https://github.com/misode/mcmeta) (`1.21.1-data` / `1.21.1-assets` tags)

## Milestones

### M0 — Project setup

- [x] `git init`, `.gitignore`, MIT `LICENSE`, README stub, project `CLAUDE.md` pointing to `docs/`
- [x] Vite + React + TypeScript (npm), oxlint (Vite template default instead of ESLint), Prettier, Vitest, `@xyflow/react`, Zustand
- [x] public GitHub repo `PatrykPut/create-mod-modeler`
- [x] CI workflow (lint, typecheck, format, test) + Pages deploy workflow (`base: '/create-mod-modeler/'`)
- **Done** (2026-10-22): empty canvas live at https://patrykput.github.io/create-mod-modeler/, CI green.

### M1 — Vertical slice: cobblestone → gravel → iron nugget → iron ingot

- [x] Data script v0 (`npm run data`): crushing, milling, splashing, pressing, compacting (item ingredients only — tags and fluids skipped for now); vanilla 2×2/3×3 crafting → derived compacting; names from lang files; flat item/block textures
- [x] Formulas (test-first): crushing wheels, millstone, fan (splashing), press/compactor; stress impacts
- [x] Model + LP solver (`yalps`, test-first), incl. reference chain test (`src/core/derive.test.ts`)
- [x] Derive: machine count (fraction, ceil, utilisation), SU per node and total, summary
- [x] UI: canvas, add recipe/source via search, drag from a port onto empty canvas to add a matching node, machine variant picker, typed ports with icons, global RPM + time unit, per-node RPM / stack size / stacks in air / target, summary panel, autosave
- **Done** (2026-10-22): the example chain builds in the app with the rates, machine counts and SU of the reference test.

Left for later milestones: tag ingredients (e.g. `c:eggs`), block icons via item models (some blocks show placeholders), fixed per-edge ratios.

### M2 — Breadth: recipes, fluids, heat

- [x] Data script: all v1 recipe types; derived shapeless → mixer, stonecutting → saw; fan blasting/smoking from vanilla smelting/smoking; furnace node
- [x] Formulas: mixer (re-verified), saw, deployer, spout, item drain, mechanical crafter (approximation, flagged in UI), item application, sandpaper polishing
- [x] Mechanical drills on cobblestone/basalt sources (optimised generator + info tooltip, tick-simulated against the source)
- [x] Fluids as resources (mB/min ports)
- [x] Heat: burner count, fuel input port with fuel picker, continuous consumption
- [x] Carried over from M1: tag ingredients (tag ports any member can feed), block icons via item models
- [x] Create's runtime-generated recipes (log sawing, concrete washing), bucket filling/emptying
- **Done** (2026-10-23): 1710 recipes; brass (heated mixer + burner + coal), log → planks → crushing wheel (crafter, tag input) and lava → bucket (spout) solve in the app.

Left for later: fixed per-edge ratios, potion fluids, sandpaper as a consumed input.

### M3 — Logistics & power

- [x] Edge transport types Belt / Chute / Pipe / Ideal, limits, over-limit warnings with lanes needed, per-edge belt/pump RPM, items per entry (single items or brass-funnel stacks)
- [x] Power source nodes: water wheel, large water wheel, windmill, hand crank, creative motor, steam engine (required boiler level; 1 pump up to level 12, 2 from level 13); auto count or fixed
- [x] Summary: SU usage vs. capacity, burners and fuel, bottlenecks
- **Done** (2026-10-23): the iron chain on belts and a chute with a steam engine and water wheels shows 10,240 / 17,408 SU, including pipe and boiler pumps; a slow belt shows up as a bottleneck.

Left for later: fan-driven chutes, funnel extraction rates, separate kinetic networks.

### M4 — Sharing & polish

- [x] Multiple named plans, JSON export/import, share link (compressed plan in URL), CSV export of the summary
  - Plan library in browser storage (v1 single plan migrates to "My plan"); file format `create-mod-modeler/plan`; share link `#plan=` with deflate-raw + base64url; CSV `section,id,name,amount,unit` in the chosen time unit
- [x] Create-style dark theme (andesite / brass / copper), readable font, pixel icons
  - System font for text, Pixelify Sans (OFL, bundled) for the logo, pixel-art cog as logo and favicon
- [x] Tooltips for approximations and assumptions; "Not affiliated" notice
  - One styled tooltip layer for every `data-tip` (hover and keyboard focus); ⓘ notes on machines, drills, power sources, transport types and summary sections
- [x] Playwright smoke test; README with screenshots
  - `npm run e2e` runs in CI against the production build; `npm run screenshots` regenerates `docs/screenshots/` from `e2e/fixtures/iron-chain.json`
- **Plans & sharing done** (2026-10-23): the iron chain renames, duplicates, exports to JSON and CSV, and reopens from a share link as "Iron chain (2)"; a foreign JSON file is rejected with a message.
- **Done** (2026-10-25): smoke test green in CI (empty start, recipe search, import, belt RPM on an edge, share link, tooltip); README shows the iron chain.

### After M4

- [x] Sources limited to generators, tree farms, crop farms and pumps; limestone and scoria generators with drills; invalid sources removed on load (store version 3) and on import with a notice
- Left for later: harvesters, saws and farm sizes per farm source

## Open verifications

- ~~Mixer cycle formula~~ — recomputed from source (DESIGN §4.1)
- Belt hand-off delays for saw, drain and other belt-fed machines (assumed not to be the bottleneck)
- Mechanical crafter refill time and grid layout (approximation)
- ~~License of Create's textures~~ — checked: assets are All Rights Reserved; decided to ship them anyway (DESIGN §1)
- ~~Git tag of the Create 6.0.10 release~~ — `mc1.21.1-6.0.10`
