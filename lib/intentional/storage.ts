export const STORE_NAMES = [
  'monthlyGoals',
  'rewards',
  'weeklyGoals',
  'dailyTasks',
  'reflections',
  'reviews',
  'settings',
] as const

export type StoreName = (typeof STORE_NAMES)[number]
export type AllData = Record<StoreName, Array<{ id: string }>>

export interface Storage {
  readonly kind: 'indexeddb' | 'sqlite' | 'memory'
  getAll<T>(store: StoreName): Promise<T[]>
  get<T>(store: StoreName, id: string): Promise<T | undefined>
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void>
  delete(store: StoreName, id: string): Promise<void>
  exportAll(): Promise<AllData>
  /** Atomically replaces every record in every store. */
  replaceAll(data: AllData): Promise<void>
}

export function emptyData(): AllData {
  return Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as AllData
}

export class MemoryStorage implements Storage {
  readonly kind = 'memory' as const
  private stores = new Map<StoreName, Map<string, unknown>>(
    STORE_NAMES.map((n) => [n, new Map()]),
  )

  async getAll<T>(store: StoreName): Promise<T[]> {
    return structuredClone([...this.stores.get(store)!.values()]) as T[]
  }
  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    const v = this.stores.get(store)!.get(id)
    return v === undefined ? undefined : (structuredClone(v) as T)
  }
  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    this.stores.get(store)!.set(value.id, structuredClone(value))
  }
  async delete(store: StoreName, id: string): Promise<void> {
    this.stores.get(store)!.delete(id)
  }
  async exportAll(): Promise<AllData> {
    const out = emptyData()
    for (const n of STORE_NAMES) out[n] = (await this.getAll(n)) as Array<{ id: string }>
    return out
  }
  async replaceAll(data: AllData): Promise<void> {
    for (const n of STORE_NAMES) {
      const m = this.stores.get(n)!
      m.clear()
      for (const v of data[n] ?? []) m.set(v.id, structuredClone(v))
    }
  }
}

const DB_NAME = 'intentional'
const DB_VERSION = 1

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export class IndexedDbStorage implements Storage {
  readonly kind = 'indexeddb' as const
  private constructor(private db: IDBDatabase) {}

  static open(name = DB_NAME): Promise<IndexedDbStorage> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(name, DB_VERSION)
      open.onupgradeneeded = () => {
        const db = open.result
        for (const n of STORE_NAMES) {
          if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' })
        }
      }
      open.onsuccess = () => resolve(new IndexedDbStorage(open.result))
      open.onerror = () => reject(open.error)
    })
  }

  close() {
    this.db.close()
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const tx = this.db.transaction(store, 'readonly')
    return req(tx.objectStore(store).getAll()) as Promise<T[]>
  }
  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    const tx = this.db.transaction(store, 'readonly')
    return req(tx.objectStore(store).get(id)) as Promise<T | undefined>
  }
  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    await txDone(tx)
  }
  async delete(store: StoreName, id: string): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    await txDone(tx)
  }
  async exportAll(): Promise<AllData> {
    const tx = this.db.transaction([...STORE_NAMES], 'readonly')
    const out = emptyData()
    for (const n of STORE_NAMES) {
      out[n] = (await req(tx.objectStore(n).getAll())) as Array<{ id: string }>
    }
    return out
  }
  async replaceAll(data: AllData): Promise<void> {
    const tx = this.db.transaction([...STORE_NAMES], 'readwrite')
    for (const n of STORE_NAMES) {
      const os = tx.objectStore(n)
      os.clear()
      for (const v of data[n] ?? []) os.put(v)
    }
    await txDone(tx)
  }
}
