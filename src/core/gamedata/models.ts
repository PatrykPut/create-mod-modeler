// Picks one texture to stand in as an item's icon, from its item model and the model's parents.

type Model = { parent?: string; textures?: Record<string, string> }

/** Texture variables that show the face a player recognises, best first. */
const FACE_KEYS = [
  'layer0',
  'all',
  'front',
  'side',
  'texture',
  'top',
  'end',
  'particle',
]
const MAX_PARENTS = 16

const withNamespace = (id: string) =>
  id.includes(':') ? id : `minecraft:${id}`

/**
 * @param readModel returns the model JSON for an id such as "minecraft:block/slab"
 * @returns a texture id such as "minecraft:block/stone", or undefined
 */
export function iconTexture(
  item: string,
  readModel: (id: string) => Model | undefined,
): string | undefined {
  const [namespace, path] = item.split(':')
  // child textures override their parents'
  const textures: Record<string, string> = {}
  let id: string | undefined = `${namespace}:item/${path}`
  for (let depth = 0; id && depth < MAX_PARENTS; depth++) {
    const model = readModel(withNamespace(id))
    if (!model) break
    for (const [key, value] of Object.entries(model.textures ?? {}))
      textures[key] ??= value
    id = model.parent
  }

  const resolve = (value: string | undefined, seen = 0): string | undefined =>
    value?.startsWith('#') && seen < MAX_PARENTS
      ? resolve(textures[value.slice(1)], seen + 1)
      : value
  for (const key of [...FACE_KEYS, ...Object.keys(textures)]) {
    const texture = resolve(textures[key])
    if (texture && !texture.startsWith('#')) return withNamespace(texture)
  }
  return undefined
}
