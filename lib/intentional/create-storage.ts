import { Capacitor } from '@capacitor/core'
import { IndexedDbStorage, type Storage } from './storage'

let pending: Promise<Storage> | null = null

/** SQLite inside the Android app; IndexedDB in the browser / PWA. */
export function createStorage(): Promise<Storage> {
  if (!pending) {
    pending = (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { SqliteStorage } = await import('./sqlite-storage')
          return await SqliteStorage.open()
        } catch (err) {
          console.error('[intentional] SQLite unavailable, falling back to IndexedDB', err)
        }
      }
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        navigator.storage.persist().catch(() => undefined)
      }
      return IndexedDbStorage.open()
    })()
  }
  return pending
}
