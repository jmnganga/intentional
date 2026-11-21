'use client'

import { CalendarDays, CalendarRange, CheckSquare, History, Home } from 'lucide-react'
import { useEffect } from 'react'
import { IntentionalProvider, useIntentional, type Tab } from '@/lib/intentional/app-context'
import { cn } from '@/lib/utils'
import { DailyScreen } from './daily-screen'
import { HistoryScreen } from './history-screen'
import { HomeScreen } from './home-screen'
import { MonthlyScreen } from './monthly-screen'
import { SettingsSheet } from './settings-sheet'
import { WeeklyScreen } from './weekly-screen'

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'monthly', label: 'Month', icon: CalendarRange },
  { id: 'weekly', label: 'Week', icon: CalendarDays },
  { id: 'daily', label: 'Day', icon: CheckSquare },
  { id: 'history', label: 'History', icon: History },
]

function Shell() {
  const { tab, setTab, toasts } = useIntentional()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl pb-28">
      <main className="px-4 pt-[max(env(safe-area-inset-top),1.25rem)]">
        {tab === 'home' ? <HomeScreen /> : null}
        {tab === 'monthly' ? <MonthlyScreen /> : null}
        {tab === 'weekly' ? <WeeklyScreen /> : null}
        {tab === 'daily' ? <DailyScreen /> : null}
        {tab === 'history' ? <HistoryScreen /> : null}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map(({ id, label, icon: Icon }) => (
            <li key={id} className="flex-1">
              <button
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  tab === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-xl flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto w-full rounded-xl border px-4 py-3 text-sm shadow-lg',
              t.kind === 'error'
                ? 'border-destructive/40 bg-card text-destructive'
                : 'border-primary/40 bg-card text-primary',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
      <SettingsSheet />
    </div>
  )
}

export function AppShell() {
  return (
    <IntentionalProvider>
      <Shell />
    </IntentionalProvider>
  )
}
