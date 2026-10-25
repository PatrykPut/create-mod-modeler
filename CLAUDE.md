# Create Mod Modeler

Node-based production planner for the Minecraft mod Create (static web app, GitHub Pages).

- Design decisions and mechanics/formula reference: `docs/DESIGN.md` — read before changing calculations.
- Roadmap and milestones: `docs/IMPLEMENTATION.md` — tick off items as they land.

## Conventions

- `src/core` is pure TypeScript (no React, no DOM) and must never import from `src/ui`. All numbers the UI shows come from `core`.
- Core calculations are built test-first with Vitest; tests sit next to the code as `*.test.ts`.
- Rates in `core` are always per minute (fluids in mB per minute); conversion happens only for display.
- Every machine formula cites its Create source file (`mc1.21.1/dev` branch) in a comment.
- Target data version: Create 6.0.10, Minecraft 1.21.1 NeoForge.
- UI text is English only.
- Before committing: `npm run lint && npm run typecheck && npm test && npm run format:check`.
- UI changes: also `npm run e2e` (Playwright smoke test); rerun `npm run screenshots` when the README images go stale.
