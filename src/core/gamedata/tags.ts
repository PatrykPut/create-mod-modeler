// Item and fluid tags merged from all data sources (vanilla, NeoForge `c:` tags, Create, addon packs);
// block tags only for fan processing catalysts of addon packs.

export type TagKind = 'item' | 'fluid' | 'block'

export type TagEntry = string | { id: string; required?: boolean }

/** Raw entries per tag, keyed "<kind>:<tag>" (e.g. "item:c:ingots/zinc"). */
export type TagEntries = Record<string, TagEntry[]>

export class TagIndex {
  private entries = new Map<string, TagEntry[]>()
  private supported: (id: string) => boolean

  /** @param supported keeps only members from mods we model (vanilla, Create). */
  constructor(supported: (id: string) => boolean) {
    this.supported = supported
  }

  static fromJSON(entries: TagEntries, supported: (id: string) => boolean) {
    const index = new TagIndex(supported)
    for (const [key, values] of Object.entries(entries))
      index.entries.set(key, [...values])
    return index
  }

  /** Later files add to a tag, unless they set `replace` (as datapacks do). */
  add(
    kind: TagKind,
    tag: string,
    json: { replace?: boolean; values?: TagEntry[] },
  ) {
    const key = `${kind}:${tag}`
    this.entries.set(key, [
      ...(json.replace ? [] : (this.entries.get(key) ?? [])),
      ...(json.values ?? []),
    ])
  }

  toJSON(): TagEntries {
    return Object.fromEntries(
      [...this.entries].sort(([a], [b]) => a.localeCompare(b)),
    )
  }

  /** All supported members, in file order, without duplicates. */
  resolve(kind: TagKind, tag: string): string[] {
    const members = new Set<string>()
    const visit = (current: string, seen: Set<string>) => {
      if (seen.has(current)) return
      seen.add(current)
      for (const entry of this.entries.get(`${kind}:${current}`) ?? []) {
        const id = typeof entry === 'string' ? entry : entry.id
        if (id.startsWith('#')) visit(id.slice(1), seen)
        else if (this.supported(id)) members.add(id)
      }
    }
    visit(tag, new Set())
    return [...members]
  }
}
