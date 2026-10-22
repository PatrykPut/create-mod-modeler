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

- [ ] Data script v0: crushing, milling, splashing recipes; vanilla 3×3 crafting → derived compacting; textures for the involved items
- [ ] Formulas (test-first): crushing wheels, millstone, fan (splashing), press/compactor; stress impacts
- [ ] Model + solver (test-first). Reference test: 60 cobblestone/min → 60 gravel/min → 7.5 iron nuggets/min + 15 flint/min → 0.833 iron ingots/min, with machine counts at 256 RPM
- [ ] Derive: machine count (fraction, ceil, utilisation), SU per node and total
- [ ] UI: canvas, add recipe node via item search, recipe variant picker, typed ports with icons, connect/disconnect, input/source node, global RPM + time unit bar, per-node RPM and stack size, basic summary panel (inputs, outputs, machines, SU), autosave
- **Done when:** the example chain can be built in the deployed app and shows correct rates, machine counts and SU.

### M2 — Breadth: recipes, fluids, heat

- [ ] Data script: all v1 recipe types; derived shapeless → mixer, stonecutting → saw; fan blasting/smoking from vanilla smelting/smoking; furnace node
- [ ] Formulas: mixer (**re-verify first**), saw, deployer, spout, item drain, mechanical crafter (approximation, flagged in UI), item application, sandpaper polishing
- [ ] Mechanical drill node (optimised cobble gen + info tooltip)
- [ ] Fluids as resources (mB/min ports)
- [ ] Heat: burner count, fuel input port with fuel picker, continuous consumption

### M3 — Logistics & power

- [ ] Edge transport types Belt / Chute / Pipe / Ideal, limits, over-limit warnings, per-edge belt RPM, insertion type (andesite/brass funnel) → stack size
- [ ] Power source nodes: water wheel, large water wheel, windmill, hand crank, creative motor, steam engine (required boiler level; 1 pump up to level 12, 2 from level 13)
- [ ] Summary: SU usage vs. capacity, burners and fuel, bottlenecks

### M4 — Sharing & polish

- [ ] Multiple named plans, JSON export/import, share link (compressed plan in URL), CSV export of the summary
- [ ] Create-style dark theme (andesite / brass / copper), readable font, pixel icons
- [ ] Tooltips for approximations and assumptions; "Not affiliated" notice
- [ ] Playwright smoke test; README with screenshots

## Open verifications

- Mixer cycle formula (DESIGN §4.1) — recompute from source before implementing
- License of Create's textures — check before the first deploy that ships icons (M1)
- Exact git tag name of the Create 6.0.10 release on the 1.21.1 branch
