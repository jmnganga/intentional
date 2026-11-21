'use client'

import { Gift, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useIntentional } from '@/lib/intentional/app-context'
import { formatDate, formatDateLong } from '@/lib/intentional/dates'
import { cycleBounds } from '@/lib/intentional/schedule'
import type { MonthlyGoalInput } from '@/lib/intentional/service'
import { rewardStatus, summarize } from '@/lib/intentional/stats'
import type { MonthlyGoal } from '@/lib/intentional/types'
import { CommitmentRow } from './commitment-row'
import { TaskPlanner } from './task-planner'
import {
  Badge,
  Card,
  EmptyState,
  GhostButton,
  LockNotice,
  PrimaryButton,
  ProgressBar,
  ScreenHeader,
  SectionTitle,
  Segmented,
  Sheet,
  TextArea,
  TextInput,
} from './ui'

function GoalForm({
  open,
  onOpenChange,
  editing,
  cycleId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: MonthlyGoal | null
  cycleId: string
}) {
  const { app, act } = useIntentional()
  const bounds = cycleBounds(cycleId)
  const empty: MonthlyGoalInput = {
    title: '',
    description: '',
    reason: '',
    importance: '',
    actionPlan: '',
    obstacles: '',
    prevention: '',
    deadline: bounds.end,
  }
  const [form, setForm] = useState<MonthlyGoalInput>(empty)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = open ? (editing?.id ?? 'new') : null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (key) setForm(editing ? { ...editing } : empty)
  }
  const set =
    (k: keyof MonthlyGoalInput) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    const res = await act(
      () => (editing ? app.updateMonthlyGoal(editing.id, form) : app.addMonthlyGoal(form)),
      editing ? 'Goal updated' : 'Goal saved',
    )
    if (res.ok) onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit monthly goal' : 'New monthly goal'}
      description="Be specific. After midnight this commitment is locked."
    >
      <div className="space-y-4">
        <TextInput label="What do you want to achieve?" value={form.title} onChange={set('title')} />
        <TextArea
          label="Details (optional)"
          rows={2}
          value={form.description ?? ''}
          onChange={set('description')}
        />
        <TextArea label="Why do you want to achieve it?" value={form.reason} onChange={set('reason')} />
        <TextArea
          label="Why is it important to you?"
          value={form.importance}
          onChange={set('importance')}
        />
        <TextArea
          label="What actions will you take?"
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
        <TextInput
          label="Deadline"
          type="date"
          min={bounds.start}
          max={bounds.end}
          value={form.deadline ?? bounds.end}
          onChange={set('deadline')}
        />
        <PrimaryButton onClick={submit}>{editing ? 'Save changes' : 'Save goal'}</PrimaryButton>
      </div>
    </Sheet>
  )
}

function ReviewPanel({ cycleId }: { cycleId: string }) {
  const { app, snap, now, act } = useIntentional()
  const goals = snap.monthlyGoals.filter((g) => g.cycleId === cycleId)
  const review = snap.reviews.find((r) => r.id === cycleId)
  const rewards = snap.rewards.filter((r) => r.cycleId === cycleId)
  const [form, setForm] = useState({ whyFailed: '', learned: '', improve: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  if (goals.length === 0) {
    return <EmptyState>No monthly goals were set for the cycle that just ended.</EmptyState>
  }
  const s = summarize('monthly', goals, now)
  const status = rewardStatus(goals, rewards)
  const bounds = cycleBounds(cycleId)

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>
          Cycle {formatDate(bounds.start)} – {formatDate(bounds.end)}
        </SectionTitle>
        <p className="text-3xl font-semibold tabular-nums">
          {s.completed}/{s.total}
          <span className="ml-2 text-base font-normal text-muted-foreground">goals completed</span>
        </p>
        <ProgressBar value={s.percent} label="Monthly completion" className="mt-3" />
        {status === 'earned' ? (
          <p className="mt-4 flex items-start gap-2 text-sm text-primary">
            <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
            Reward earned: {rewards.map((r) => r.text).join(' · ')}
          </p>
        ) : status === 'not-earned' ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Reward not earned. Every goal must be completed to earn it.
          </p>
        ) : null}
      </Card>
      <ul className="space-y-2">
        {goals.map((g) => (
          <CommitmentRow key={g.id} kind="monthly" item={g} />
        ))}
      </ul>
      {review?.reviewedAt ? (
        <Card>
          <SectionTitle right={<Badge tone="accent">Reviewed</Badge>}>Monthly review</SectionTitle>
          <dl className="space-y-3 text-sm">
            {review.whyFailed ? (
              <div>
                <dt className="text-xs text-muted-foreground">Why you fell short</dt>
                <dd className="whitespace-pre-wrap">{review.whyFailed}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">What you learned</dt>
              <dd className="whitespace-pre-wrap">{review.learned}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">What you will improve</dt>
              <dd className="whitespace-pre-wrap">{review.improve}</dd>
            </div>
          </dl>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Monthly review</SectionTitle>
          <div className="space-y-4">
            {s.incomplete > 0 ? (
              <TextArea
                label="Why did you fail to complete every goal?"
                value={form.whyFailed}
                onChange={set('whyFailed')}
              />
            ) : null}
            <TextArea label="What did you learn this month?" value={form.learned} onChange={set('learned')} />
            <TextArea
              label="What will you improve next month?"
              value={form.improve}
              onChange={set('improve')}
            />
            <PrimaryButton
              onClick={() => act(() => app.saveReview(cycleId, form), 'Review saved')}
            >
              Save review
            </PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  )
}

function RewardPanel({ cycleId }: { cycleId: string }) {
  const { app, snap, act } = useIntentional()
  const rewards = snap.rewards.filter((r) => r.cycleId === cycleId)
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const save = async () => {
    const res = await act(
      () => (editingId ? app.updateReward(editingId, text) : app.addReward(text)),
      editingId ? 'Reward updated' : 'Reward saved',
    )
    if (res.ok) {
      setText('')
      setEditingId(null)
    }
  }

  return (
    <Card>
      <SectionTitle>Your reward</SectionTitle>
      <p className="mb-3 text-sm text-muted-foreground">
        Only earned if every monthly goal is completed. Decide it now, while planning is open.
      </p>
      {rewards.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {rewards.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-3"
            >
              <Gift className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 text-pretty">{r.text}</span>
              <button
                type="button"
                aria-label="Edit reward"
                onClick={() => {
                  setEditingId(r.id)
                  setText(r.text)
                }}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Delete reward"
                onClick={() => act(() => app.deleteReward(r.id), 'Reward removed')}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-3">
        <TextInput
          label={editingId ? 'Edit reward' : 'Add a reward'}
          placeholder="e.g. A weekend away"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <PrimaryButton onClick={save} disabled={!text.trim()}>
          {editingId ? 'Save reward' : 'Add reward'}
        </PrimaryButton>
      </div>
    </Card>
  )
}

function PlanningSession({ cycleId, endedCycleId }: { cycleId: string; endedCycleId: string }) {
  const { snap } = useIntentional()
  const [section, setSection] = useState<'reflect' | 'goals' | 'reward' | 'prepare'>('reflect')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MonthlyGoal | null>(null)
  const { app, act } = useIntentional()
  const goals = snap.monthlyGoals.filter((g) => g.cycleId === cycleId)

  return (
    <div className="space-y-4">
      <LockNotice open>
        Monthly planning is open until midnight. Everything you save here locks at 00:00 on the 22nd.
      </LockNotice>
      <Segmented
        label="Monthly planning sections"
        value={section}
        onChange={setSection}
        options={[
          { value: 'reflect', label: 'Reflect' },
          { value: 'goals', label: 'Goals' },
          { value: 'reward', label: 'Reward' },
          { value: 'prepare', label: 'The 22nd' },
        ]}
      />
      {section === 'reflect' ? <ReviewPanel cycleId={endedCycleId} /> : null}
      {section === 'goals' ? (
        <div className="space-y-3">
          {goals.length === 0 ? (
            <EmptyState>No goals yet for the coming cycle.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g.id} className="rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-start gap-2">
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
                          void act(() => app.deleteMonthlyGoal(g.id), 'Goal deleted')
                        }
                      }}
                      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PrimaryButton
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-5" aria-hidden />
            Add a monthly goal
          </PrimaryButton>
          <GoalForm open={formOpen} onOpenChange={setFormOpen} editing={editing} cycleId={cycleId} />
        </div>
      ) : null}
      {section === 'reward' ? <RewardPanel cycleId={cycleId} /> : null}
      {section === 'prepare' ? <TaskPlanner title="Prepare the 22nd" /> : null}
    </div>
  )
}

export function MonthlyScreen() {
  const { snap, state, now } = useIntentional()

  if (state.monthly.open && state.monthly.cycleId && state.monthly.endedCycleId) {
    return (
      <>
        <ScreenHeader
          title="Monthly planning"
          subtitle={`Reflection day · ${formatDateLong(state.today)}`}
        />
        <PlanningSession cycleId={state.monthly.cycleId} endedCycleId={state.monthly.endedCycleId} />
      </>
    )
  }

  const cycleId = state.activeCycleId
  const goals = cycleId ? snap.monthlyGoals.filter((g) => g.cycleId === cycleId) : []
  const rewards = cycleId ? snap.rewards.filter((r) => r.cycleId === cycleId) : []
  const s = summarize('monthly', goals, now)
  const status = rewardStatus(goals, rewards)
  const bounds = cycleId ? cycleBounds(cycleId) : null

  return (
    <>
      <ScreenHeader
        title="Monthly goals"
        subtitle={bounds ? `${formatDate(bounds.start)} – ${formatDate(bounds.end)}` : undefined}
      />
      <div className="space-y-4">
        <LockNotice open={false}>{state.monthly.reason}</LockNotice>
        {goals.length === 0 ? (
          <EmptyState>
            No monthly goals are active. Set them on the 21st
            {state.nextMonthly ? ` (${formatDate(state.nextMonthly.date)})` : ''}.
          </EmptyState>
        ) : (
          <>
            <Card>
              <p className="text-3xl font-semibold tabular-nums">
                {s.completed}/{s.total}
                <span className="ml-2 text-base font-normal text-muted-foreground">completed</span>
              </p>
              <ProgressBar value={s.percent} label="Monthly completion" className="mt-3" />
              {rewards.length > 0 ? (
                <p className="mt-4 flex items-start gap-2 text-sm">
                  <Gift
                    className={status === 'earned' ? 'mt-0.5 size-4 text-primary' : 'mt-0.5 size-4 text-muted-foreground'}
                    aria-hidden
                  />
                  <span className={status === 'earned' ? 'text-primary' : 'text-muted-foreground'}>
                    {status === 'earned'
                      ? `Earned: ${rewards.map((r) => r.text).join(' · ')}`
                      : `Reward: ${rewards.map((r) => r.text).join(' · ')} (complete every goal)`}
                  </span>
                </p>
              ) : null}
            </Card>
            <ul className="space-y-2">
              {goals.map((g) => (
                <CommitmentRow key={g.id} kind="monthly" item={g} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
