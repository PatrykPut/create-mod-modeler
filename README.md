# Create Mod Modeler

A node-based production planner for the Minecraft mod [Create](https://github.com/Creators-of-Create/Create), inspired by the Satisfactory Modeler. Wire recipes into production chains and see item rates, machine counts and stress (SU) usage — calculated from the formulas in Create's source code.

**Live:** https://patrykput.github.io/create-mod-modeler/

Targets Create 6.0.10 on Minecraft 1.21.1 (NeoForge). Work in progress — see [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the roadmap and [docs/DESIGN.md](docs/DESIGN.md) for the design and mechanics reference.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run lint       # oxlint
npm run typecheck  # tsc
npm run build      # production build into dist/
npm run data       # regenerate src/data/*.json and public/textures/ from the Create and vanilla sources
```

Textures in `public/textures/` belong to the Create team and Mojang (see its `NOTICE.md`); they are not covered by this project's license.

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with Mojang, Microsoft or the Create team.
