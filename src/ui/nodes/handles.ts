// Port handles are identified by side and item, e.g. "out:minecraft:gravel".
export const handleId = (side: 'in' | 'out', item: string) => `${side}:${item}`

export const itemOfHandle = (handle: string | null | undefined) =>
  handle ? handle.slice(handle.indexOf(':') + 1) : undefined
