// Blocks that stand for machines, power sources and farms in the UI. `npm run data` renders
// their item models into isometric icons (scripts/data/build.ts imports this list).
export const MACHINE_BLOCKS = [
  'create:crushing_wheel',
  'create:millstone',
  'create:encased_fan',
  'create:mechanical_press',
  'create:mechanical_mixer',
  'create:mechanical_saw',
  'create:deployer',
  'create:spout',
  'create:item_drain',
  'create:mechanical_crafter',
  'minecraft:furnace',
  'minecraft:blast_furnace',
  'minecraft:smoker',
  'create:mechanical_drill',
  'create:mechanical_harvester',
  'create:blaze_burner',
  'create:mechanical_pump',
  'create:water_wheel',
  'create:large_water_wheel',
  'create:windmill_bearing',
  'create:hand_crank',
  'create:creative_motor',
  'create:steam_engine',
] as const

export type MachineBlock = (typeof MACHINE_BLOCKS)[number]
