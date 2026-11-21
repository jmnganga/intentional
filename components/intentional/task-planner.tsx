'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useIntentional } from '@/lib/intentional/app-context'
import { formatDateLong, formatDuration } from '@/lib/intentional/dates'
import { cycleBounds } from '@/lib/intentional/schedule'
import { taskDuration, type DailyTaskInput } from '@/lib/intentional/service'
import type { DailyTask } from '@/lib/intentional/types'
import {
  Card,
  EmptyState,
  GhostButton,
  LockNotice,
  PrimaryButton,
  SectionTitle,
  SelectInput,
  Sheet,
  TextArea,
  TextInput,
} from './ui'

const blank: DailyTaskInput = {
  title: '',
  description: '',
  weeklyGoalId: '',
  monthlyGoalId: '',
  start: '09:00',
  end: '10:00',
  overnight: false,
  obstacles: '',
  prevention: '',
}

function TaskForm({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: DailyTask | null
}) {
  const { app, snap, state, act } = useIntentional()
  const target = state.daily.targetDate
  const [form, setForm] = useState<DailyTaskInput>(blank)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const key = open ? (editing?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (key) {
      setForm(
        editing
          ? {
              title: editing.title,
              description: editing.description,
              weeklyGoalId: editing.weeklyGoalId ?? '',
              monthlyGoalId: editing.monthlyGoalId ?? '',
              start: editing.start,
              end: editing.end,
              overnight: editing.overnight,
              obstacles: editing.obstacles,
              prevention: editing.prevention,
            }
          : blank,
      )
    }
  }

  const weeklyOptions = snap.weeklyGoals.filter(
    (g) => g.periodStart <= target && target <= g.periodEnd,
  )
  const monthlyOptions = snap.monthlyGoals.filter((g) => {
    const b = cycleBounds(g.cycleId)
    return b.start <= target && target <= b.end
  })

  const set =
    <K extends keyof DailyTaskInput>(k: K) =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const duration =
    form.start && form.end ? taskDuration(form.start, form.end, !!form.overnight) : 0

  const submit = async () => {
    const res = await act(
      () => (editing ? app.updateDailyTask(editing.id, form) : app.addDailyTask({ ...form, date: target })),
      editing ? 'Task updated' : 'Task locked in for tomorrow',
    )
    if (res.ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit task' : 'New task'}
      description={`For ${formatDateLong(target)}. It locks when this planning window closes.`}
    >
      <div className="space-y-4">
        <TextInput label="Task title" value={form.title} onChange={set('title')} />
        <TextArea
          label="Description (optional)"
          rows={2}
          value={form.description ?? ''}
          onChange={set('description')}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Starts" type="time" value={form.start} onChange={set('start')} />
          <TextInput label="Finishes" type="time" value={form.end} onChange={set('end')} />
        </div>
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[#d6f5b5]"
            checked={!!form.overnight}
            onChange={(e) => setForm((f) => ({ ...f, overnight: e.target.checked }))}
          />
          Finishes after midnight (the next day)
        </label>
        {duration > 0 ? (
          <p className="text-xs text-muted-foreground">Duration: {formatDuration(duration)}</p>
        ) : null}
        {weeklyOptions.length > 0 ? (
          <SelectInput
            label="Weekly goal (optional)"
            value={form.weeklyGoalId ?? ''}
            onChange={set('weeklyGoalId')}
          >
            <option value="">None</option>
            {weeklyOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </SelectInput>
        ) : null}
        {monthlyOptions.length > 0 ? (
          <SelectInput
            label="Monthly goal (optional)"
            value={form.monthlyGoalId ?? ''}
            onChange={set('monthlyGoalId')}
          >
            <option value="">None</option>
            {monthlyOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </SelectInput>
        ) : null}
        <TextArea
          label="What could get in the way?"
          rows={2}
          value={form.obstacles}
          onChange={set('obstacles')}
        />
        <TextArea
          label="How will you prevent that?"
          rows={2}
          value={form.prevention}
          onChange={set('prevention')}
        />
        <PrimaryButton onClick={submit}>{editing ? 'Save changes' : 'Commit to this task'}</PrimaryButton>
      </div>
    </Sheet>
  )
}

/** Plans tomorrow's tasks. Used by the daily screen, weekly session and the 21st session. */
export function TaskPlanner({ title = "Tomorrow's tasks" }: { title?: string }) {
  const { app, snap, state, today, act } = useIntentional()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DailyTask | null>(null)

  const target = state.daily.targetDate
  const sessionKey = `${state.daily.via === 'monthly' ? 'monthly' : 'daily'}:${today}`
  const tasks = useMemo(
    () =>
      snap.dailyTasks
        .filter((t) => t.date === target)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [snap.dailyTasks, target],
  )
  const open = state.daily.open

  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <LockNotice open={open} className="mb-3">
        {open
          ? `Open now. You are planning ${formatDateLong(target)}.`
          : state.daily.reason}
      </LockNotice>
      {tasks.length === 0 ? (
        <EmptyState>
          {open ? 'Nothing planned yet. Add your first task.' : `No tasks were planned for ${formatDateLong(target)}.`}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const editable = open && t.sessionKey === sessionKey
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-pretty font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.start}–{t.end}
                    {t.overnight ? ' (+1 day)' : ''} · {formatDuration(t.durationMinutes)}
                  </p>
                </div>
                {editable ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${t.title}`}
                      onClick={() => {
                        setEditing(t)
                        setFormOpen(true)
                      }}
                      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.title}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${t.title}"?`)) {
                          void act(() => app.deleteDailyTask(t.id), 'Task deleted')
                        }
                      }}
                      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Locked</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open ? (
        <GhostButton
          className="mt-3 w-full"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add a task
        </GhostButton>
      ) : null}
      <TaskForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </Card>
  )
}
