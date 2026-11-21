'use client'

import { useState } from 'react'
import { useIntentional } from '@/lib/intentional/app-context'
import { formatDate, formatDateLong } from '@/lib/intentional/dates'
import { cycleBounds } from '@/lib/intentional/schedule'
import { rewardStatus, summarize } from '@/lib/intentional/stats'
import { CommitmentRow } from './commitment-row'
import { Badge, Card, EmptyState, ProgressBar, ScreenHeader, Segmented } from './ui'

export function HistoryScreen() {
  const { snap, now } = useIntentional()
  const [view, setView] = useState<'months' | 'weeks' | 'days'>('months')

  const cycles = [...new Set(snap.monthlyGoals.map((g) => g.cycleId))].sort().reverse()
  const weeks = [...new Set(snap.weeklyGoals.map((g) => g.sessionDate))].sort().reverse()
  const days = [...new Set(snap.dailyTasks.map((t) => t.date))].sort().reverse()

  return (
    <>
      <ScreenHeader title="History" subtitle="Everything you committed to, and what happened." />
      <div className="space-y-4">
        <Segmented
          label="History range"
          value={view}
          onChange={setView}
          options={[
            { value: 'months', label: 'Months' },
            { value: 'weeks', label: 'Weeks' },
            { value: 'days', label: 'Days' },
          ]}
        />

        {view === 'months' ? (
          cycles.length === 0 ? (
            <EmptyState>No monthly plans yet.</EmptyState>
          ) : (
            cycles.map((c) => {
              const goals = snap.monthlyGoals.filter((g) => g.cycleId === c)
              const rewards = snap.rewards.filter((r) => r.cycleId === c)
              const s = summarize('monthly', goals, now)
              const b = cycleBounds(c)
              const status = rewardStatus(goals, rewards)
              return (
                <Card key={c}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="font-medium">
                      {formatDate(b.start)} – {formatDate(b.end)}
                    </h2>
                    {status === 'earned' ? <Badge tone="accent">Reward earned</Badge> : null}
                    {status === 'not-earned' ? <Badge>No reward</Badge> : null}
                  </div>
                  <ProgressBar value={s.percent} label="Cycle completion" />
                  <p className="mb-3 mt-2 text-sm text-muted-foreground">
                    {s.completed} of {s.total} goals · {s.percent}%
                  </p>
                  <ul className="space-y-2">
                    {goals.map((g) => (
                      <CommitmentRow key={g.id} kind="monthly" item={g} />
                    ))}
                  </ul>
                </Card>
              )
            })
          )
        ) : null}

        {view === 'weeks' ? (
          weeks.length === 0 ? (
            <EmptyState>No weekly plans yet.</EmptyState>
          ) : (
            weeks.map((w) => {
              const goals = snap.weeklyGoals.filter((g) => g.sessionDate === w)
              const s = summarize('weekly', goals, now)
              return (
                <Card key={w}>
                  <h2 className="font-medium">
                    {formatDate(goals[0].periodStart)} – {formatDate(goals[0].periodEnd)}
                  </h2>
                  <p className="mb-3 mt-1 text-sm text-muted-foreground">
                    {s.completed} of {s.total} · {s.percent}%
                  </p>
                  <ul className="space-y-2">
                    {goals.map((g) => (
                      <CommitmentRow key={g.id} kind="weekly" item={g} />
                    ))}
                  </ul>
                </Card>
              )
            })
          )
        ) : null}

        {view === 'days' ? (
          days.length === 0 ? (
            <EmptyState>No daily tasks yet.</EmptyState>
          ) : (
            days.map((d) => {
              const tasks = snap.dailyTasks
                .filter((t) => t.date === d)
                .sort((a, b) => a.start.localeCompare(b.start))
              const s = summarize('daily', tasks, now)
              return (
                <Card key={d}>
                  <h2 className="font-medium">{formatDateLong(d)}</h2>
                  <p className="mb-3 mt-1 text-sm text-muted-foreground">
                    {s.completed} of {s.total} · {s.percent}%
                  </p>
                  <ul className="space-y-2">
                    {tasks.map((t) => (
                      <CommitmentRow key={t.id} kind="daily" item={t} />
                    ))}
                  </ul>
                </Card>
              )
            })
          )
        ) : null}
      </div>
    </>
  )
}
