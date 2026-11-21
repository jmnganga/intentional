'use client'

import { useIntentional } from '@/lib/intentional/app-context'
import { formatDateLong } from '@/lib/intentional/dates'
import { summarize } from '@/lib/intentional/stats'
import { CommitmentRow } from './commitment-row'
import { TaskPlanner } from './task-planner'
import { Card, EmptyState, ProgressBar, ScreenHeader, SectionTitle } from './ui'

export function DailyScreen() {
  const { snap, state, today, now } = useIntentional()
  const todays = snap.dailyTasks
    .filter((t) => t.date === today)
    .sort((a, b) => a.start.localeCompare(b.start))
  const s = summarize('daily', todays, now)

  return (
    <>
      <ScreenHeader title="Daily tasks" subtitle={formatDateLong(today)} />
      <div className="space-y-4">
        <div>
          <SectionTitle>Today</SectionTitle>
          {todays.length === 0 ? (
            <EmptyState>Nothing was planned for today. Plan tomorrow tonight from 21:00 to 22:00.</EmptyState>
          ) : (
            <div className="space-y-3">
              <Card>
                <p className="text-2xl font-semibold tabular-nums">
                  {s.completed}/{s.total}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">done</span>
                </p>
                <ProgressBar value={s.percent} label="Today's completion" className="mt-3" />
              </Card>
              <ul className="space-y-2">
                {todays.map((t) => (
                  <CommitmentRow key={t.id} kind="daily" item={t} />
                ))}
              </ul>
            </div>
          )}
        </div>
        {state.isMonthlyDay ? null : <TaskPlanner />}
      </div>
    </>
  )
}
