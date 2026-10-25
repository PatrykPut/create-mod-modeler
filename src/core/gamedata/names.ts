// Display names for items, fluids and tags, from the en_us language entries.

export type Lang = Record<string, string>

export const titleCase = (path: string) =>
  path.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Name of an item or a fluid ("fluid:<id>"); falls back to the id's path in title case. */
export function resourceName(id: string, lang: Lang): string {
  const fluid = id.startsWith('fluid:')
  const [namespace, path] = (fluid ? id.slice(6) : id).split(':')
  return (
    lang[`${fluid ? 'fluid' : 'item'}.${namespace}.${path}`] ??
    lang[`block.${namespace}.${path}`] ??
    titleCase(path)
  )
}

const MAX_LISTED_MEMBERS = 3

/**
 * "Oak Planks / Spruce Planks" for small tags; larger ones are "Planks (any)", or
 * "Oak Planks (or 8 others)" for a recipe's own list of alternatives.
 */
export function tagName(
  id: string,
  memberNames: string[],
  synthetic: boolean,
): string {
  if (memberNames.length <= MAX_LISTED_MEMBERS) return memberNames.join(' / ')
  if (synthetic)
    return `${memberNames[0]} (or ${memberNames.length - 1} others)`
  return `${titleCase(id.split(/[:/]/).at(-1)!)} (any)`
}
