// Fan processing types of addons (DESIGN §6). Create looks up a type's catalysts in the block and
// fluid tags "<namespace>:fan_processing_catalysts/<type>" (AllTags, AllFanProcessingTypes) and
// addons follow that convention; their recipes have the type "<namespace>:<type>" in Create's
// processing format. Every type runs on the same timer (FanProcessing.applyProcessing).
import type { FanProcessing, ResourceId } from '../../data/types'
import { fluidId, isSourceFluid } from '../gamedata/normalize.ts'
import { titleCase } from '../gamedata/names.ts'
import type { TagIndex } from '../gamedata/tags.ts'
import type { TagFile } from './archive'

const CATALYST_TAG = /^([a-z0-9_.-]+):fan_processing_catalysts\/(.+)$/

/** Catalysts an addon checks in code instead of (or besides) its tags, by recipe type. */
const CODE_CATALYSTS: Record<string, string> = {
  // CreateDragonsPlus EndingFanProcessingType: the block tag is empty, the dragon head is
  // checked in code (ponder "bulk_ending": "Dragon Head or Dragon Breath")
  'create_dragons_plus:ending': 'Dragon Head or Dragon Breath',
  // CreateDragonsPlus FreezingFanProcessingType: no catalyst tag (ponder "bulk_freezing")
  'create_dragons_plus:freezing': 'Powder Snow',
}

/** "A", "A or B", "A, B or C" */
const either = (names: string[]) =>
  names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

/**
 * Fan processing modes by recipe type, from the packs' catalyst tags and the known addons.
 * @param name display name of a block or a fluid ("fluid:<id>")
 */
export function addonFanTypes(
  tags: TagFile[],
  tagIndex: TagIndex,
  name: (id: ResourceId) => string,
): Map<string, FanProcessing> {
  const types = new Set(Object.keys(CODE_CATALYSTS))
  for (const { tag } of tags) {
    const match = CATALYST_TAG.exec(tag)
    // Create's own types are recipe types of their own (splashing, haunting, …)
    if (match && match[1] !== 'create') types.add(`${match[1]}:${match[2]}`)
  }

  const fans = new Map<string, FanProcessing>()
  for (const type of types) {
    const [namespace, path] = type.split(':')
    const tag = `${namespace}:fan_processing_catalysts/${path}`
    const members = [
      ...tagIndex.resolve('block', tag),
      ...tagIndex.resolve('fluid', tag).filter(isSourceFluid).map(fluidId),
    ]
    const fan: FanProcessing = { mode: titleCase(path) }
    const catalyst = CODE_CATALYSTS[type] ?? either(members.map(name))
    if (catalyst) fan.catalyst = catalyst
    fans.set(type, fan)
  }
  return fans
}
