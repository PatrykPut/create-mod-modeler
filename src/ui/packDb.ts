// Recipe packs in IndexedDB (archives are too large for localStorage).
// Without IndexedDB (private mode, blocked site data) packs only last for the session.
import type { PackArchive } from '../core/packs/archive'

export interface StoredPack {
  /** Mod id of the jar, or "file:<name>" for datapacks. */
  id: string
  name: string
  version: string
  fileName: string
  enabled: boolean
  /** ms since epoch; later packs override earlier ones */
  addedAt: number
  archive: PackArchive
}

const DB_NAME = 'create-mod-modeler'
const STORE = 'packs'

let db: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return db
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const store = (await open()).transaction(STORE, mode).objectStore(STORE)
  return new Promise((resolve, reject) => {
    const request = action(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadPacks(): Promise<StoredPack[]> {
  try {
    return await run<StoredPack[]>('readonly', (s) => s.getAll())
  } catch {
    return []
  }
}

export async function savePack(pack: StoredPack): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(pack))
  } catch {
    // session only
  }
}

export async function deletePack(id: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id))
  } catch {
    // session only
  }
}
