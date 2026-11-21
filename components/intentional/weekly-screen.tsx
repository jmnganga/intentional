'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useIntentional } from '@/lib/intentional/app-context'
import { formatDate, formatDateLong } from '@/lib/intentional/dates'
import { weeklySchedule } from '@/lib/intentional/schedule'
import type { WeeklyGoalInput } from '@/lib/intentional/service'
import type { WeeklyGoal } from '@/lib/intentional/types'
import { CommitmentRow } from './commitment-row'
import { TaskPlanner } from './task-planner'
import {
  Badge,
  Card,
  EmptyState,
  LockNotice,
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
  SelectInput,
  Sheet,
  TextArea,
  TextInput,
} from './ui'

function WeeklyForm({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: WeeklyGoal | null
}) {
  const { app, snap, state, act } = useIntentional()
  const start = editing?.periodStart ?? state.weekly.periodStart ?? ''
  const end = editing?.periodEnd ?? state.weekly.periodEnd ?? ''
  const empty: WeeklyGoalInput = {
    title: '',
    description: '',
    reason: '',
    actionPlan: '',
    obstacles: '',
    prevention: '',
    monthlyGoalId: '',
    deadline: end,
  }
  const [form, setForm] = useState<WeeklyGoalInput>(empty)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = open ? (editing?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (key) setForm(editing ? { ...editing } : empty)
  }
  const set =
    (k: keyof WeeklyGoalInput) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const options = snap.monthlyGoals.filter((g) => g.cycleId === state.activeCycleId)

  const submit = async () => {
    const res = await act(
      () => (editing ? app.updateWeeklyGoal(editing.id, form) : app.addWeeklyGoal(form)),
      editing ? 'Goal updated' : 'Weekly goal saved',
    )
    if (res.ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit weekly goal' : 'New weekly goal'}
      description={start ? `For ${formatDate(start)} – ${formatDate(end)}. Locks at 22:00.` : undefined}
    >
      <div className="space-y-4">
        <TextInput label="What do you want to achieve?" value={form.title} onChange={set('title')} />
        <TextArea
          label="Details (optional)"
          rows={2}
          value={form.description ?? ''}
          onChange={set('description')}
        />
        <TextArea label="Why?" value={form.reason} onChange={set('reason')} />
        <TextArea
          label="How will you make sure you achieve it?"
          value={form.actionPlan}
          onChange={set('actionPlan')}
        />
        <TextArea
          label="What obstacles might stop you?"
          value={form.obstacles}
          onChange={set('obstacles')}
        />
        <TextArea
          label="How will you prevent them?"
          value={form.prevention}
          onChange={set('prevention')}
        />
        {options.length > 0 ? (
          <SelectInput
            label="Supports monthly goal (optional)"
            value={form.monthlyGoalId ?? ''}
            onChange={set('monthlyGoalId')}
          >
            <option value="">None</option>
            {options.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </SelectInput>
        ) : null}
        <TextInput
          label="Deadline"
          type="date"
          min={start}
          max={end}
          value={form.deadline ?? end}
          onChange={set('deadline')}
        />
        <PrimaryButton onClick={submit}>{editing ? 'Save changes' : 'Save goal'}</PrimaryButton>
      </div>
    </Sheet>
  )
}

function ScheduleList() {
  const { snap, today } = useIntentional()
  if (!snap.anchor) return null
  const slots = weeklySchedule(snap.anchor, today, 5)
  return (
    <Card>
      <SectionTitle>Weekly planning schedule</SectionTitle>
      <ul className="space-y-2 text-sm">
        {slots.map((s) => (
          <li key={s.date} className="flex items-center justify-between gap-3">
            <span>{formatDateLong(s.date)}</span>
            {s.conflict ? <Badge tone="warn">Skipped: monthly day</Badge> : <span className="text-muted-foreground">21:00–22:00</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Every 7 days, counted from your first monthly plan. It never resets at month end.
      </p>
    </Card>
  )
}

export function WeeklyScreen() {
  const { app, snap, state, today, act } = useIntentional()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WeeklyGoal | null>(null)

  const sessionDate = state.weekly.sessionDate
  const sessionKey = sessionDate ? `weekly:${sessionDate}` : ''
  const planning = sessionDate ? snap.weeklyGoals.filter((g) => g.sessionKey === sessionKey) : []

  const current = snap.weeklyGoals.filter((g) => g.periodStart <= today && today <= g.periodEnd)
  const latest = [...snap.weeklyGoals].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]
  const showing = current.length > 0 ? current : latest ? snap.weeklyGoals.filter((g) => g.sessionDate === latest.sessionDate) : []

  return (
    <>
      <ScreenHeader title="Weekly goals" subtitle="Seven days at a time, planned on your rolling schedule." />
      <div className="space-y-4">
        <LockNotice open={state.weekly.open}>{state.weekly.reason}</LockNotice>

        {state.weekly.open && sessionDate ? (
          <>
            <Card>
              <SectionTitle>
                Plan {formatDate(state.weekly.periodStart!)} – {formatDate(state.weekly.periodEnd!)}
              </SectionTitle>
              {planning.length === 0 ? (
                <EmptyState>No weekly goals yet.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {planning.map((g) => (
                    <li key={g.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-pretty font-medium">{g.title}</p>
                        <p className="text-xs text-muted-foreground">Due {formatDate(g.deadline)}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Edit ${g.title}`}
                        onClick={() => {
                          setEditing(g)
                          setFormOpen(true)
                        }}
                        className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${g.title}`}
                        onClick={() => {
                          if (window.confirm(`Delete "${g.title}"?`)) {
                            void act(() => app.deleteWeeklyGoal(g.id), 'Goal deleted')
                          }
                        }}
                        className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <PrimaryButton
                className="mt-3"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-5" aria-hidden />
                Add a weekly goal
              </PrimaryButton>
              <WeeklyForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
            </Card>
            <TaskPlanner title="Then plan tomorrow" />
          </>
        ) : null}

        {showing.length > 0 ? (
          <div>
            <SectionTitle>
              This week · {formatDate(showing[0].periodStart)} – {formatDate(showing[0].periodEnd)}
            </SectionTitle>
            <ul className="space-y-2">
              {showing.map((g) => (
                <CommitmentRow key={g.id} kind="weekly" item={g} />
              ))}
            </ul>
          </div>
        ) : !state.weekly.open ? (
          <EmptyState>No weekly goals yet.</EmptyState>
        ) : null}

        <ScheduleList />
      </div>
    </>
  )
}
