'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import useSWR from 'swr'
import { createStorage } from './create-storage'
import { toDateStr } from './dates'
import { applyNotificationPlan, buildNotificationPlan } from './notifications'
import type { PlanningState } from './schedule'
import { Intentional, PlanningError } from './service'
import type { Snapshot } from './types'

export type Tab = 'home' | 'monthly' | 'weekly' | 'daily' | 'history'

interface Toast {
  id: number
  kind: 'ok' | 'error'
  message: string
}

interface AppContextValue {
  app: Intentional
  snap: Snapshot
  now: Date
  today: string
  state: PlanningState
  tab: Tab
  setTab: (tab: Tab) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  reload: () => Promise<void>
  /** Runs a mutation, refreshes data and surfaces any rule violation as a toast. */
  act: <T>(fn: () => Promise<T>, success?: string) => Promise<{ ok: true; value: T } | { ok: false }>
  toasts: Toast[]
  storageKind: string
}

const Ctx = createContext<AppContextValue | null>(null)

export function useIntentional(): AppContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIntentional must be used inside IntentionalProvider')
  return v
}

export function IntentionalProvider({ children }: { children: ReactNode }) {
  const { data: app, error } = useSWR(
    'intentional-app',
    async () => new Intentional(await createStorage()),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  )
  const { data: snap, mutate } = useSWR(
    app ? 'intentional-snapshot' : null,
    async () => {
      await app!.syncCycleResults()
      return app!.snapshot()
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  )

  const [now, setNow] = useState(() => new Date())
  const [tab, setTab] = useState<Tab>('home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  // Re-check every permission: periodically, on resume and when the clock changes.
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick()
        void mutate()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [mutate])

  const today = toDateStr(now)
  useEffect(() => {
    if (app) void mutate()
  }, [today, app, mutate])

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, kind, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const reload = useCallback(async () => {
    await mutate()
  }, [mutate])

  const act = useCallback<AppContextValue['act']>(
    async (fn, success) => {
      try {
        const value = await fn()
        await mutate()
        setNow(new Date())
        if (success) pushToast('ok', success)
        return { ok: true, value }
      } catch (err) {
        const message =
          err instanceof PlanningError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Something went wrong.'
        pushToast('error', message)
        await mutate()
        setNow(new Date())
        return { ok: false }
      }
    },
    [mutate, pushToast],
  )

  const state = useMemo(() => (app && snap ? app.stateFrom(snap) : null), [app, snap, now])

  const planKey = useRef('')
  useEffect(() => {
    if (!app || !snap) return
    const plan = buildNotificationPlan(new Date(), snap.anchor, snap.dailyTasks, snap.notificationPrefs)
    const key = JSON.stringify(plan.map((p) => [p.key, p.at.getTime()]))
    if (key === planKey.current) return
    planKey.current = key
    applyNotificationPlan(plan).catch((err) => console.error('[intentional] notifications', err))
  }, [app, snap, today])

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="text-destructive">
          Local storage could not be opened. Close other copies of the app and reopen it.
        </p>
      </main>
    )
  }

  if (!app || !snap || !state) {
    return (
      <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <p className="text-sm text-muted-foreground">Opening Intentional…</p>
      </main>
    )
  }

  return (
    <Ctx.Provider
      value={{
        app,
        snap,
        now,
        today,
        state,
        tab,
        setTab,
        settingsOpen,
        setSettingsOpen,
        reload,
        act,
        toasts,
        storageKind: app.storage.kind,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
