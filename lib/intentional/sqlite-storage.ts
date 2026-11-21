import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { emptyData, STORE_NAMES, type AllData, type Storage, type StoreName } from './storage'

/**
 * Native Android storage: one SQLite table holding JSON records per logical store.
 * Only used when running inside the Capacitor Android shell.
 */
export class SqliteStorage implements Storage {
  readonly kind = 'sqlite' as const
  private constructor(private db: SQLiteDBConnection) {}

  static async open(): Promise<SqliteStorage> {
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    const db = await sqlite.createConnection('intentional', false, 'no-encryption', 1, false)
    await db.open()
    await db.execute(
      `CREATE TABLE IF NOT EXISTS records (
         store TEXT NOT NULL,
         id TEXT NOT NULL,
         json TEXT NOT NULL,
         PRIMARY KEY (store, id)
       );`,
    )
    return new SqliteStorage(db)
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const res = await this.db.query('SELECT json FROM records WHERE store = ?', [store])
    return (res.values ?? []).map((r) => JSON.parse(r.json) as T)
  }

  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    const res = await this.db.query('SELECT json FROM records WHERE store = ? AND id = ?', [
      store,
      id,
    ])
    const row = res.values?.[0]
    return row ? (JSON.parse(row.json) as T) : undefined
  }

  async put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO records (store, id, json) VALUES (?, ?, ?)',
      [store, value.id, JSON.stringify(value)],
      true,
    )
  }

  async delete(store: StoreName, id: string): Promise<void> {
    await this.db.run('DELETE FROM records WHERE store = ? AND id = ?', [store, id], true)
  }

  async exportAll(): Promise<AllData> {
    const out = emptyData()
    for (const n of STORE_NAMES) out[n] = await this.getAll<{ id: string }>(n)
    return out
  }

  async replaceAll(data: AllData): Promise<void> {
    const set: { statement: string; values: unknown[] }[] = [
      { statement: 'DELETE FROM records', values: [] },
    ]
    for (const n of STORE_NAMES) {
      for (const v of data[n] ?? []) {
        set.push({
          statement: 'INSERT OR REPLACE INTO records (store, id, json) VALUES (?, ?, ?)',
          values: [n, v.id, JSON.stringify(v)],
        })
      }
    }
    await this.db.executeSet(set, true)
  }
}
