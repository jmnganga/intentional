'use client'

import { ArrowRight, Settings } from 'lucide-react'
import { useIntentional, type Tab } from '@/lib/intentional/app-context'
import { formatDate, formatDateLong, formatDateTime } from '@/lib/intentional/dates'
import { cycleBounds } from '@/lib/intentional/schedule'
import { rewardStatus, summarize } from '@/lib/intentional/stats'
import { CommitmentRow } from './commitment-row'
import { Badge, Card, EmptyState, ProgressBar, SectionTitle } from './ui'

function Stat({
  label,
  completed,
  total,
  percent,
  onClick,
}: {
  label: string
  completed: number
  total: number
  percent: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-secondary/60"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {completed}
        <span className="text-sm font-normal text-muted-foreground">/{total}</span>
      </p>
      <ProgressBar value={percent} label={`${label} completion`} className="mt-2" />
    </button>
  )
}

export function HomeScreen() {
  const { snap, state, now, today, setTab, setSettingsOpen } = useIntentional()

  const cycleId = state.activeCycleId
  const goals = cycleId ? snap.monthlyGoals.filter((g) => g.cycleId === cycleId) : []
  const rewards = cycleId ? snap.rewards.filter((r) => r.cycleId === cycleId) : []
  const weekly = snap.weeklyGoals.filter((g) => g.periodStart <= today && today <= g.periodEnd)
  const todays = snap.dailyTasks
    .filter((t) => t.date === today)
    .sort((a, b) => a.start.localeCompare(b.start))

  const m = summarize('monthly', goals, now)
  const w = summarize('weekly', weekly, now)
  const d = summarize('daily', todays, now)
  const bounds = cycleId ? cycleBounds(cycleId) : null
  const status = rewardStatus(goals, rewards)

  const openTarget: Tab | null = state.monthly.open
    ? 'monthly'
    : state.weekly.open
      ? 'weekly'
      : state.daily.open
        ? 'daily'
        : null

  const phaseTone = state.phase === 'EXECUTION MODE' ? 'neutral' : state.phase === 'PLANNING CLOSED' ? 'warn' : 'accent'

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatDateLong(today)}</p>
          <h1 className="text-balance mt-1 text-2xl font-semibold tracking-tight">Intentional</h1>
        </div>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <Settings className="size-5" aria-hidden />
        </button>
      </header>

      <div className="space-y-4">
        <Card className={openTarget ? 'border-primary/40 bg-primary/10' : undefined}>
          <div className="flex items-center justify-between gap-3">
            <Badge tone={phaseTone}>{state.phase}</Badge>
            <span className="text-sm tabular-nums text-muted-foreground">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-pretty mt-3 text-sm">
            {state.monthly.open
              ? state.monthly.reason
              : state.weekly.open
                ? state.weekly.reason
                : state.daily.open
                  ? state.daily.reason
                  : state.weekly.scheduledToday
                    ? state.weekly.reason
                    : state.daily.reason}
          </p>
          {openTarget ? (
            <button
              type="button"
              onClick={() => setTab(openTarget)}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Start planning
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : state.next ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Next planning window: {state.next.label}, {formatDateTime(state.next.start)} to{' '}
              {state.next.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </Card>

        {bounds ? (
          <p className="text-xs text-muted-foreground">
            Cycle {formatDate(bounds.start)} – {formatDate(bounds.end)}
            {status === 'earned' ? ' · Reward earned' : ''}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Month" completed={m.completed} total={m.total} percent={m.percent} onClick={() => setTab('monthly')} />
          <Stat label="Week" completed={w.completed} total={w.total} percent={w.percent} onClick={() => setTab('weekly')} />
          <Stat label="Today" completed={d.completed} total={d.total} percent={d.percent} onClick={() => setTab('daily')} />
        </div>

        <div>
          <SectionTitle>Today</SectionTitle>
          {todays.length === 0 ? (
            <EmptyState>No tasks planned for today.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {todays.map((t) => (
                <CommitmentRow key={t.id} kind="daily" item={t} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
