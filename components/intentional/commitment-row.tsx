'use client'

import { Check, ChevronDown, Clock, NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatDuration } from '@/lib/intentional/dates'
import { useIntentional } from '@/lib/intentional/app-context'
import { deadlineOf, isMissed } from '@/lib/intentional/stats'
import type { DailyTask, ItemKind, MonthlyGoal, Reflection, WeeklyGoal } from '@/lib/intentional/types'
import { cn } from '@/lib/utils'
import { Badge, GhostButton, PrimaryButton, Sheet, TextArea } from './ui'

type Item = MonthlyGoal | WeeklyGoal | DailyTask

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-pretty text-sm text-foreground/90">{value}</dd>
    </div>
  )
}

function ReflectionSummary({ r }: { r: Reflection }) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-background/50 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warn">
        Reflection
      </p>
      <dl className="space-y-2">
        <Detail label="Why didn't you achieve this?" value={r.why} />
        <Detail label="What prevented you?" value={r.prevented} />
        <Detail label="Could you have avoided it?" value={r.avoidable} />
        <Detail label="What could you have done differently?" value={r.different} />
        <Detail label="What will you change next time?" value={r.change} />
      </dl>
    </div>
  )
}

export function ReflectionSheet({
  kind,
  item,
  open,
  onOpenChange,
}: {
  kind: ItemKind
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { app, act } = useIntentional()
  const [form, setForm] = useState({ why: '', prevented: '', avoidable: '', different: '', change: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    const res = await act(() => app.addReflection(kind, item.id, form), 'Reflection saved')
    if (res.ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Why was this missed?"
      description="Your original commitment stays unchanged. This reflection is added to the record."
    >
      <div className="space-y-4">
        <TextArea label="1. Why didn't you achieve this?" value={form.why} onChange={set('why')} />
        <TextArea
          label="2. What prevented you from achieving it?"
          value={form.prevented}
          onChange={set('prevented')}
        />
        <TextArea
          label="3. Could you have avoided that obstacle?"
          value={form.avoidable}
          onChange={set('avoidable')}
        />
        <TextArea
          label="4. What could you have done differently?"
          value={form.different}
          onChange={set('different')}
        />
        <TextArea
          label="5. What will you change next time?"
          value={form.change}
          onChange={set('change')}
        />
        <PrimaryButton onClick={submit}>Save reflection</PrimaryButton>
      </div>
    </Sheet>
  )
}

export function CommitmentRow({
  kind,
  item,
  startOpen = false,
}: {
  kind: ItemKind
  item: Item
  startOpen?: boolean
}) {
  const { app, snap, now, today, act } = useIntentional()
  const [open, setOpen] = useState(startOpen)
  const [reflecting, setReflecting] = useState(false)

  const done = item.status === 'completed'
  const missed = isMissed(kind, item, now)
  const deadline = deadlineOf(kind, item)
  const pastDeadline = now.getTime() > deadline.getTime()
  const reflection = snap.reflections.find((r) => r.id === `${kind}:${item.id}`)

  const canComplete =
    kind === 'monthly'
      ? today > (item as MonthlyGoal).cycleId
      : kind === 'weekly'
        ? today > (item as WeeklyGoal).sessionDate
        : today >= (item as DailyTask).date

  const monthlyTitle = (id: string | null) =>
    id ? snap.monthlyGoals.find((g) => g.id === id)?.title : undefined
  const weeklyTitle = (id: string | null) =>
    id ? snap.weeklyGoals.find((g) => g.id === id)?.title : undefined

  const meta =
    kind === 'daily'
      ? (() => {
          const t = item as DailyTask
          return `${formatDate(t.date)} · ${t.start}–${t.end}${t.overnight ? ' (+1 day)' : ''} · ${formatDuration(t.durationMinutes)}`
        })()
      : `Due ${formatDate((item as MonthlyGoal | WeeklyGoal).deadline)}`

  const toggle = () =>
    act(() => app.setCompleted(kind, item.id, !done), done ? 'Marked as not done' : 'Marked complete')

  return (
    <li className="rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-3 p-3.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${item.title}`}
          disabled={!canComplete}
          onClick={toggle}
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            done
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background/60 text-transparent hover:border-primary',
          )}
        >
          <Check className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('text-pretty font-medium', done && 'text-muted-foreground line-through')}>
            {item.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {meta}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {done && !missed ? <Badge tone="accent">Done</Badge> : null}
            {done && missed ? <Badge tone="warn">Done late</Badge> : null}
            {!done && missed ? <Badge tone="danger">Missed</Badge> : null}
            {!done && !missed && !canComplete ? <Badge>Locked in</Badge> : null}
            {!done && !missed && canComplete ? <Badge>In progress</Badge> : null}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Hide commitment details' : 'Show commitment details'}
          onClick={() => setOpen((o) => !o)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <ChevronDown className={cn('size-5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="border-t border-border px-3.5 pb-3.5 pt-3">
          <dl className="space-y-2.5">
            {kind === 'monthly' ? (
              <>
                <Detail label="Details" value={(item as MonthlyGoal).description} />
                <Detail label="Why I want it" value={(item as MonthlyGoal).reason} />
                <Detail label="Why it is important" value={(item as MonthlyGoal).importance} />
                <Detail label="Action plan" value={(item as MonthlyGoal).actionPlan} />
                <Detail label="Possible obstacles" value={(item as MonthlyGoal).obstacles} />
                <Detail label="Prevention" value={(item as MonthlyGoal).prevention} />
              </>
            ) : null}
            {kind === 'weekly' ? (
              <>
                <Detail label="Details" value={(item as WeeklyGoal).description} />
                <Detail label="Why" value={(item as WeeklyGoal).reason} />
                <Detail label="How I will make sure" value={(item as WeeklyGoal).actionPlan} />
                <Detail label="Possible obstacles" value={(item as WeeklyGoal).obstacles} />
                <Detail label="Prevention" value={(item as WeeklyGoal).prevention} />
                <Detail
                  label="Monthly goal"
                  value={monthlyTitle((item as WeeklyGoal).monthlyGoalId) ?? ''}
                />
              </>
            ) : null}
            {kind === 'daily' ? (
              <>
                <Detail label="Details" value={(item as DailyTask).description} />
                <Detail
                  label="Weekly goal"
                  value={weeklyTitle((item as DailyTask).weeklyGoalId) ?? ''}
                />
                <Detail
                  label="Monthly goal"
                  value={monthlyTitle((item as DailyTask).monthlyGoalId) ?? ''}
                />
                <Detail label="Possible obstacles" value={(item as DailyTask).obstacles} />
                <Detail label="Prevention" value={(item as DailyTask).prevention} />
              </>
            ) : null}
          </dl>
          {reflection ? <ReflectionSummary r={reflection} /> : null}
        </div>
      ) : null}

      {!done && pastDeadline && !reflection ? (
        <div className="border-t border-border p-3">
          <GhostButton className="w-full" onClick={() => setReflecting(true)}>
            <NotebookPen className="size-4" aria-hidden />
            Reflect on why this was missed
          </GhostButton>
          <ReflectionSheet kind={kind} item={item} open={reflecting} onOpenChange={setReflecting} />
        </div>
      ) : null}
    </li>
  )
}
