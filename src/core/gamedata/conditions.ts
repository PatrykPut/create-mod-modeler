// NeoForge recipe conditions (`neoforge:conditions`), evaluated against the loaded mods.
// Source: NeoForge 1.21.1 net/neoforged/neoforge/common/conditions/*Condition.java

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function holds(condition: unknown, loaded: ReadonlySet<string>): boolean {
  if (!isObject(condition)) return false
  const all = (values: unknown) =>
    Array.isArray(values) && values.every((v) => holds(v, loaded))
  switch (condition.type) {
    case 'neoforge:mod_loaded':
      return typeof condition.modid === 'string' && loaded.has(condition.modid)
    case 'neoforge:not':
      return isObject(condition.value) && !holds(condition.value, loaded)
    case 'neoforge:and':
      return all(condition.values)
    case 'neoforge:or':
      return (
        Array.isArray(condition.values) &&
        condition.values.some((v) => holds(v, loaded))
      )
    case 'neoforge:true':
      return true
    default:
      // neoforge:false, tag_empty, item_exists, other mods' config conditions
      return false
  }
}

/** Whether a recipe's conditions hold; all conditions of the list must hold. */
export function conditionsMet(
  conditions: unknown,
  loaded: ReadonlySet<string>,
): boolean {
  if (conditions === undefined) return true
  return Array.isArray(conditions) && conditions.every((c) => holds(c, loaded))
}
