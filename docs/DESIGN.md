# Create Mod Modeler — Design

A node-based production planner for the Minecraft mod [Create](https://github.com/Creators-of-Create/Create), in the spirit of the Satisfactory Modeler. Users wire recipe nodes into production chains (e.g. cobblestone → gravel → iron nuggets → iron ingot) and see rates, machine counts, stress (SU) usage and logistics limits.

Status: design agreed, implementation not started.

## 1. Product decisions

| Topic               | Decision                                                                                                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format              | Static web app, no backend                                                                                                                                                                                                                                                                      |
| Stack               | React + TypeScript + Vite + React Flow (xyflow)                                                                                                                                                                                                                                                 |
| Hosting             | GitHub Pages, deployed by a GitHub Action on push to `main`                                                                                                                                                                                                                                     |
| License             | MIT                                                                                                                                                                                                                                                                                             |
| Audience / language | Public community tool, English UI only (no i18n infrastructure)                                                                                                                                                                                                                                 |
| Target version      | Create **6.0.10**, Minecraft **1.21.1 NeoForge**. Data model carries a version field so 1.20.1 / other versions can be added later                                                                                                                                                              |
| Recipe scope (v1)   | Base Create + the vanilla recipes needed for chains (smelting, crafting, stonecutting). Addon recipe packs later                                                                                                                                                                                |
| Data source         | Recipe JSONs + textures from the Create repo/jar via a build script; machine formulas and stress values ported from Create source code. The [Fandom wiki](https://create.fandom.com/wiki/Wiki) is only for cross-checking and descriptions                                                      |
| Icons               | Create + vanilla textures copied into `public/textures/` (with `NOTICE.md`). Create's assets are "All Rights Reserved" (only its code is MIT) — shipped anyway like other community tools, isolated so they can be removed quickly; items without a texture fall back to a coloured placeholder |
| Persistence         | Autosave of multiple named plans in browser storage, export/import as `.json`, share link with the compressed plan in the URL                                                                                                                                                                   |

## 2. Calculation model

- **Manual graph.** The user places nodes and connects output ports to input ports. A full auto-planner is out of scope for v1.
- **Rates come from one linear system.** Sources have fixed rates (or "unlimited"), any node may optionally carry a target ("deliver 40 iron ingots/min"), every other node adapts. The whole graph is solved at once; if sources and targets don't fit together, the result shows shortage or surplus instead of failing.
- **Recipe nodes.** A node is a recipe: the user searches for an output item, the machine follows from the recipe. If several recipes produce the item (e.g. gravel via crushing wheels or millstone), the variant is chosen on the node.
- **Units.** Items per minute by default, globally switchable to per second / per hour. Fluids in mB per minute.
- **Chance outputs** use expected values (washing gravel → 0.125 iron nuggets per gravel on average). The chance is shown on the output port.
- **Distribution.** An output feeding several inputs is split automatically by demand; surplus is shown, shortage is warned about. Fixed per-edge ratios are optional.
- **Cycles** are allowed; the linear system solves them exactly. Infeasible setups are reported as shortage.
- **RPM.** Global default **256 RPM**, overridable per node.
- **Input stack size** is a per-node parameter (1–64) with a sensible default, because crushing wheels, fans and saws process whole stacks and their speed depends on the stack size.
- **Machine count** shown as a fraction plus the rounded-up count and utilisation ("2.4 → 3 mixers, 80 %"). SU uses the rounded-up count, since idle machines still draw stress.

## 3. Node types (v1)

| Node                | Notes                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe node         | Any supported recipe type (see §5). Shows machines needed, SU, heat requirement                                                                                                                                                                                   |
| Input / source node | Raw resource with a user-set rate or "unlimited". For items a fluid generator makes (cobblestone, basalt) the source also shows the **Mechanical Drills** needed (count, utilisation, SU at the source's own or the global RPM); can be switched off              |
| Mechanical Drill    | Part of the source node, not a node of its own. Always modelled as an **optimised generator** (`CobbleGenOptimisation`: drops go straight into a belt/hopper/chute next to the generated block, so nothing has to regrow). An info tooltip states this assumption |
| Power source nodes  | Water wheel, large water wheel, windmill (sail count), hand crank, creative motor, steam engine (see §4.4)                                                                                                                                                        |

### Heat and fuel

- Heated recipe nodes count the Blaze Burners they need (1 per basin) and get an extra **fuel input port**. Selectable fuels: coal, charcoal, coal block, lava bucket, blaze cake, … The port can be wired like any other resource (e.g. to a blaze cake chain).
- Fuel is consumed **continuously per burner, even when idle**, based on the rounded-up machine count.

### Edges (transport)

Each edge has a transport type: **Belt**, **Chute**, **Pipe** or **Ideal** (unlimited).

- Belt: limit from belt RPM and stack size per entry. The belt RPM is the global RPM unless overridden on the edge. The insertion method (andesite vs. brass funnel) determines the stack size on the belt.
- Chute: stack-based, gravity speed (see §4.3).
- Pipe: for fluids, limit from pump RPM.
- Over-limit edges show a warning.

### Summary panel

Side panel next to the graph: raw inputs, products, surplus and bottlenecks, machine list with counts (BOM), Blaze Burners and fuel, SU usage vs. capacity. Exportable as text/CSV.

## 4. Mechanics reference (from Create source, `mc1.21.1/dev`)

Paths are relative to `src/main/java/com/simibubi/create/`. **[V]** = read in source, **[U]** = uncertain, re-verify when implementing. Times are in ticks (20 ticks = 1 s). `T` = recipe processing time, `n` = input stack size.

### 4.1 Processing speed

| Machine            | Formula                                                                                                                                                                                                                                                                                                                                                            | Source                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Crushing Wheels    | Phase 1: each tick subtract `clamp((RPM/50·4) / log2(n), 0.25, 20)` from T (default 100) until T < 20 — a single item divides by 0 and runs at the cap of 20 regardless of RPM; phase 2: subtract `clamp(RPM/50·4, 0.25, 20)` until ≤ 0. Whole stack per cycle. Falls back to **milling** recipes when no crushing recipe matches. One unit = 2 wheels = 16 SU/RPM | `content/kinetics/crusher/CrushingWheelControllerBlockEntity` (`tick`, `findRecipe`) [V] |
| Millstone          | `1 + ceil(T / clamp(int(RPM/16), 1, 512))` ticks (one tick starts the timer). One item per cycle                                                                                                                                                                                                                                                                   | `MillstoneBlockEntity` [V]                                                               |
| Mechanical Press   | Cycle of 240 units, step `s = int(1 + 59·min(RPM/512, 1))` per tick → `ceil(120/s) + floor(120/s) + 2` ticks (256 RPM: 10). One item per cycle (`bulkPressing` default false); one recipe per cycle on a basin; basin restart delay assumed 0 [U]. Basin compacting also runs 2×2/3×3 crafting recipes of one item (`canCompress`)                                 | `content/kinetics/press/PressingBehaviour`, `MechanicalPressBlockEntity` [V]             |
| Mechanical Mixer   | ≈ `40 + max(floor(log2(int(512/RPM))) · ceil(15·T/100) + 1, 1)` ticks; factor 15 used when T = 0. One recipe per cycle                                                                                                                                                                                                                                             | `content/kinetics/mixer/MechanicalMixerBlockEntity` [V, re-check]                        |
| Mechanical Saw     | Start value `T (default 50) · max(1, n/5)`, subtract `clamp(RPM/24, 1, 128)` per tick; output when remainder < 5, then 20 units wind-down. One item at a time (`bulkCutting` default false)                                                                                                                                                                        | `content/kinetics/saw/SawBlockEntity` [V]                                                |
| Encased Fan        | **RPM-independent**: a stack must stay `150 · (floor((n−1)/16) + 1) + 3` ticks in the air current (config `fanProcessingTime`), whole stack. RPM only sets range: `lerp(min(RPM/256, 1), 3, 20)` blocks. The modeler asks for **stacks in the air current at once** (depot = 1, one per belt block in range)                                                       | `content/kinetics/fan/processing/FanProcessing`, `IAirCurrentSource` [V]                 |
| Mechanical Crafter | Speed `c = clamp(int RPM, 4, 250)`; each hand-over 1000/c ticks, crafting step 2000/c. Total depends on grid/chain size → **shown as an approximation** on the node                                                                                                                                                                                                | `MechanicalCrafterBlockEntity` [U]                                                       |
| Deployer           | Speed `d = clamp(2·RPM, 8, 512)`; cycle 1000 + 1000 + 500 units → ≈ `2500/d + 3` ticks. One item per activation on a belt                                                                                                                                                                                                                                          | `DeployerBlockEntity`, `BeltDeployerCallbacks` [V]                                       |
| Spout              | `FILLING_TIME = 20` ticks, one item per pass, tank 1000 mB (≈ 1 item/s [U])                                                                                                                                                                                                                                                                                        | `content/fluids/spout/SpoutBlockEntity` [V]                                              |
| Item Drain         | `FILLING_TIME = 20` ticks, one item per pass, tank 1500 mB                                                                                                                                                                                                                                                                                                         | `content/fluids/drain/ItemDrainBlockEntity` [V]                                          |

#### Mechanical Drill (optimised cobble gen)

- `breakSpeed bs = |RPM| / 100`; progress per hit `clamp(int(bs/h), 1, 10 − progress)`, block breaks at 10; gap between hits `floor(h/bs) + 1` ticks. After a break the next start waits for the lazy tick, which comes every **11 ticks** in effect. [V]
- Derived: `N = ceil(10 / max(1, floor(bs/h)))`, `D = 1 + (N−1)·(floor(h/bs)+1)`, cycle = `11·(floor(D/11)+1)` ticks → hard cap 1 block / 11 ticks ≈ **109 blocks/min per drill**.
- `CobbleGenOptimisation`: with a belt/hopper below (or a moving chute above) the target block, drops are inserted directly and nothing regrows. If the belt is full the drop is probably lost [U].
- Sources: `content/kinetics/base/BlockBreakingKineticBlockEntity.java`, `content/kinetics/drill/DrillBlockEntity.java`.

| RPM | Cycle | Cobblestone (h = 2.0) per min |
| --- | ----- | ----------------------------- |
| 16  | 121 t | 9.9                           |
| 32  | 66 t  | 18.2                          |
| 64  | 44 t  | 27.3                          |
| 128 | 22 t  | 54.5                          |
| 256 | 11 t  | 109                           |

### 4.2 Stress

Consumption = impact × |RPM|; capacity = capacity value × generator RPM. Defaults set in `AllBlocks.java` via `CStress.setImpact/setCapacity`, runtime config `stressValues.v2` (`infrastructure/config/CStress.java`), API `api/stress/BlockStressValues.java`. [V]

| Machine                                                  | Impact (SU/RPM) |
| -------------------------------------------------------- | --------------- |
| Crushing Wheel, Mechanical Press                         | 8               |
| Millstone, Mixer, Saw, Deployer, Drill, Pump, Bearing    | 4               |
| Encased Fan, Mechanical Crafter, Mechanical Arm, Ejector | 2               |
| Chain Conveyor                                           | 1               |

| Source            | Capacity (SU/RPM) | RPM                                               | Total SU             |
| ----------------- | ----------------- | ------------------------------------------------- | -------------------- |
| Water Wheel       | 32                | 8                                                 | 256                  |
| Large Water Wheel | 128               | 4                                                 | 512                  |
| Hand Crank        | 8                 | 32                                                | 256                  |
| Windmill          | 512               | `clamp(floor(sails/8), 1, 16)`                    | depends on sails     |
| Creative Motor    | 16384             | 16–256 (set)                                      | —                    |
| Steam Engine      | 1024              | `16·m`, `m = 1 + (e ≥ 1 ? 3 : min(2, floor(4e)))` | ≈ 16384·e per engine |

`e` = engine efficiency from `BoilerData.getEngineEfficiency` (heat level / number of engines).

### 4.3 Logistics

| Element                | Behaviour                                                                                                                                                                                                                          | Source                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Belt                   | Speed `RPM/480` blocks/tick (= RPM/24 blocks/s); spacing 1 block between entries; side insertion takes a whole stack (≤ 64) as one entry → ≈ `RPM/24 · stack size` items/s (256 RPM: ~10.7 singles/s, ~680 items/s with 64-stacks) | `content/kinetics/belt/BeltBlockEntity.java`, `transport/BeltInventory.java` [V]               |
| Andesite Funnel        | Extraction every ~9 ticks (`defaultExtractionTimer = 8`), **1 item** per extraction (~2.2 items/s)                                                                                                                                 | `content/logistics/funnel/FunnelBlockEntity.java`, `infrastructure/config/CLogistics.java` [V] |
| Brass Funnel           | Same timer, amount per filter (default up to 64) → up to ~142 items/s                                                                                                                                                              | same [V]                                                                                       |
| Chute                  | One stack per chute block; gravity 4 chutes/s; with fan `(push+pull)/64` chutes/s capped at ±20 (+4 gravity downwards). Plain chute pulls 16 items from an inventory                                                               | `content/logistics/chute/ChuteBlockEntity.java` [V]                                            |
| Mechanical Pump        | Pressure =                                                                                                                                                                                                                         | RPM                                                                                            | / parallel branches; `transferSpeed = max(1, pressure/2)` mB/tick (256 RPM → 128 mB/t); range 16 blocks | `content/fluids/FluidNetwork.java`, `pump/PumpBlockEntity.java`, `PipeConnection.java` [V] |
| Mechanical Arm (later) | Move time `ceil(1024/RPM)` ticks, up to 64 items per grab, cycle ≈ 4 moves [U]                                                                                                                                                     | `content/kinetics/mechanicalArm/ArmBlockEntity.java`                                           |

### 4.4 Steam engine (simplified)

The modeler does not model boiler internals or water consumption. It computes the **boiler level required** to cover the SU demand assigned to steam engines. The water pumps feeding the boiler are added to total SU consumption (pump impact 4 SU/RPM at the node's RPM) with a fixed rule:

- boiler level 1–12 → **1 pump**
- boiler level 13+ → **2 pumps**

### 4.5 Blaze Burner fuel

Source: `content/processing/burner/BlazeBurnerBlockEntity.java`. [V unless noted]

- Superheated (seething): only `create:blaze_cake`, 3200 ticks (data map `superheated_blaze_burner_fuels`). When it runs out the burner falls back to heated for 5000 ticks for free.
- Heated (kindled): any item with a vanilla burn time, 1:1 (coal/charcoal 1600 t, planks 300 t, coal block 16000 t, lava bucket 20000 t, bucket returned) [vanilla values U]; tag `blaze_burner_fuel_regular` = 1600 t.
- Consumption is unconditional, every tick → per burner per minute: **0.75 coal** (heated) or **0.375 blaze cakes** (superheated, with continuous refill).
- Refill: automation inserts only at ≤ 500 ticks remaining (`INSERTION_THRESHOLD`).
- Passive heat (lava, fire, magma, campfire, unfuelled burner) counts as _smouldering_ and does **not** satisfy heated basin recipes.
- Creative blaze cake: infinite, cycles heat levels.

## 5. Data pipeline

- Node build script (run manually per Create release) reads from the Create repo / jar at a pinned version:
  - recipes in `src/generated/resources/data/create/recipe/<type>/` (1.21.1 layout; 1.20.1 uses `recipes/`), ignoring `compat/` in v1
  - item/block textures from the assets
  - vanilla recipes and textures for the vanilla items used
- Output: one compact, versioned data file committed to the repo.
- 1.21.1 JSON fields: `processing_time`, `results[].id`, `results[].count`, `results[].chance`, `heat_requirement`.
- **Derived recipes** (not present as JSON in the repo, generated like the game does):
  - shapeless crafting → Mixer
  - 2×2 / 3×3 crafting → Compactor (e.g. nuggets → ingot)
  - stonecutting → Saw
- Recipe types in v1: crushing, milling, pressing, mixing, compacting, splashing (washing), haunting, fan smoking/blasting, cutting, deploying, item_application, filling, emptying, mechanical_crafting (approximated), sandpaper_polishing, plus vanilla smelting/crafting.
- Formulas live in TypeScript modules with unit tests, each citing its Create source file.

## 6. Out of scope for v1

- Sequenced assembly (e.g. precision mechanism)
- Addon recipes (Create: New Age, Crafts & Additions, …) and modpack/KubeJS changes
- Create 1.20.1 / other versions
- Mechanical Arm and funnels as separate transport elements
- Drill on arbitrary blocks / non-optimised generators
- Auto-planner ("I want X/min, build the chain")
- Full kinetic network (shafts, gearboxes, ratios)
- Desktop wrapper (Tauri) and an in-game recipe export mod

## 7. Existing tools (Oct 2026)

- [createfactoryplanner.com](https://www.createfactoryplanner.com/) — JEI-like recipe browser and BOM resolution, addons selectable; RPM/SU handling unclear.
- [CreateFlow](https://create-flow-dev.vercel.app/) — "CAD" with simulation, could not be checked (HTTP 500).
- [foopis23/create-mod-calculator](https://github.com/foopis23/create-mod-calculator) — throughput calculator, mostly planned features.
- [erykczy/createmod-calculator](https://erykczy.github.io/createmod-calculator/) — drill time and stress.
- In-game: Kinetic Lens (stress analysis), Kinetic Planner (CAD overlay).

No existing tool combines a node graph with RPM-dependent throughput and SU from the actual source formulas — that is this project's niche.
