// Item and fluid tags merged from all data sources (vanilla, NeoForge `c:` tags, Create).

export type TagKind = 'item' | 'fluid'

type TagEntry = string | { id: string; required?: boolean }

export class TagIndex {
  private entries = new Map<string, TagEntry[]>()
  private supported: (id: string) => boolean

  /** @param supported keeps only members from mods we model (vanilla, Create). */
  constructor(supported: (id: string) => boolean) {
    this.supported = supported
  }

  add(kind: TagKind, tag: string, json: { values?: TagEntry[] }) {
    const key = `${kind}:${tag}`
    this.entries.set(key, [
      ...(this.entries.get(key) ?? []),
      ...(json.values ?? []),
    ])
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
