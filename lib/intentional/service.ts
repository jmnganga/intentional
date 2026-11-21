import {
  addDays,
  isValidDateStr,
  isValidTime,
  minutesOfTime,
  toDateStr,
  type DateStr,
  type TimeStr,
} from './dates'
import {
  cycleBounds,
  cycleHasEnded,
  endedCycleIdOn,
  getPlanningState,
  isMonthlyDay,
  isSessionOpen,
  weeklyPeriod,
  type PlanningState,
} from './schedule'
import { deadlineOf, goalsAllCompleted } from './stats'
import type { Storage } from './storage'
import {
  DEFAULT_NOTIFICATION_PREFS,
  type CycleReview,
  type DailyTask,
  type ItemKind,
  type MonthlyGoal,
  type NotificationPrefs,
  type Reflection,
  type Reward,
  type SettingRecord,
  type Snapshot,
  type WeeklyGoal,
} from './types'

export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

export type ErrorCode =
  | 'LOCKED'
  | 'CLOSED'
  | 'INVALID'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'EXISTS'

export class PlanningError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PlanningError'
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function text(value: unknown, label: string, required = true): string {
  const v = typeof value === 'string' ? value.trim() : ''
  if (required && !v) throw new PlanningError('INVALID', `${label} is required.`)
  return v
}

export interface MonthlyGoalInput {
  title: string
  description?: string
  reason: string
  importance: string
  actionPlan: string
  obstacles: string
  prevention: string
  deadline?: DateStr
}

export interface WeeklyGoalInput {
  title: string
  description?: string
  reason: string
  actionPlan: string
  obstacles: string
  prevention: string
  monthlyGoalId?: string | null
  deadline?: DateStr
}

export interface DailyTaskInput {
  title: string
  description?: string
  weeklyGoalId?: string | null
  monthlyGoalId?: string | null
  start: TimeStr
  end: TimeStr
  overnight?: boolean
  obstacles: string
  prevention: string
  /** Optional safeguard: if given it must equal the only legal target date (tomorrow). */
  date?: DateStr
}

export interface ReflectionInput {
  why: string
  prevented: string
  avoidable: string
  different: string
  change: string
}

export interface ReviewInput {
  whyFailed: string
  learned: string
  improve: string
}

export function taskDuration(start: TimeStr, end: TimeStr, overnight: boolean): number {
  const s = minutesOfTime(start)
  const e = minutesOfTime(end)
  return overnight ? e + 24 * 60 - s : e - s
}

export class Intentional {
  constructor(
    readonly storage: Storage,
    readonly clock: Clock = systemClock,
  ) {}

  now(): Date {
    return this.clock.now()
  }

  // ---------- settings ----------

  private async getSetting<T>(key: string): Promise<T | null> {
    const rec = await this.storage.get<SettingRecord>('settings', key)
    return rec ? (rec.value as T) : null
  }

  private async setSetting(key: string, value: unknown): Promise<void> {
    await this.storage.put<SettingRecord>('settings', { id: key, value })
  }

  async getAnchor(): Promise<DateStr | null> {
    return this.getSetting<DateStr>('weeklyAnchor')
  }

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    const saved = await this.getSetting<Partial<NotificationPrefs>>('notificationPrefs')
    return { ...DEFAULT_NOTIFICATION_PREFS, ...(saved ?? {}) }
  }

  async setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
    await this.setSetting('notificationPrefs', prefs)
  }

  async markBackup(): Promise<void> {
    await this.setSetting('lastBackupAt', this.now().toISOString())
  }

  // ---------- state ----------

  async planningState(): Promise<PlanningState> {
    const snap = await this.snapshot()
    return this.stateFrom(snap)
  }

  stateFrom(snap: Snapshot): PlanningState {
    const now = this.now()
    const today = toDateStr(now)
    const endedCycle = isMonthlyDay(today) ? endedCycleIdOn(today) : null
    const reviewPending =
      !!endedCycle &&
      snap.monthlyGoals.some((g) => g.cycleId === endedCycle) &&
      !snap.reviews.find((r) => r.id === endedCycle)?.reviewedAt
    const active = getPlanningState(now, snap.anchor).activeCycleId
    const hasActiveCycle = !!active && snap.monthlyGoals.some((g) => g.cycleId === active)
    return getPlanningState(now, snap.anchor, { reviewPending, hasActiveCycle })
  }

  async snapshot(): Promise<Snapshot> {
    const [monthlyGoals, rewards, weeklyGoals, dailyTasks, reflections, reviews] =
      await Promise.all([
        this.storage.getAll<MonthlyGoal>('monthlyGoals'),
        this.storage.getAll<Reward>('rewards'),
        this.storage.getAll<WeeklyGoal>('weeklyGoals'),
        this.storage.getAll<DailyTask>('dailyTasks'),
        this.storage.getAll<Reflection>('reflections'),
        this.storage.getAll<CycleReview>('reviews'),
      ])
    return {
      monthlyGoals,
      rewards,
      weeklyGoals,
      dailyTasks,
      reflections,
      reviews,
      anchor: await this.getAnchor(),
      notificationPrefs: await this.getNotificationPrefs(),
      lastBackupAt: await this.getSetting<string>('lastBackupAt'),
    }
  }

  // ---------- lock enforcement ----------

  private async requireOpen(sessionKey: string, what: string): Promise<void> {
    const anchor = await this.getAnchor()
    if (!isSessionOpen(sessionKey, this.now(), anchor)) {
      throw new PlanningError(
        'LOCKED',
        `${what} is locked. The planning window for it is closed and commitments cannot be changed.`,
      )
    }
  }

  private async requireMonthlyDay(what: string): Promise<DateStr> {
    const today = toDateStr(this.now())
    if (!isMonthlyDay(today)) {
      throw new PlanningError(
        'CLOSED',
        `${what} can only be changed on the 21st (00:00–23:59). Planning is closed.`,
      )
    }
    return today
  }

  // ---------- monthly ----------

  async addMonthlyGoal(input: MonthlyGoalInput): Promise<MonthlyGoal> {
    const cycleId = await this.requireMonthlyDay('Monthly goals')
    const bounds = cycleBounds(cycleId)
    const deadline = input.deadline ?? bounds.end
    if (!isValidDateStr(deadline) || deadline < bounds.start || deadline > bounds.end) {
      throw new PlanningError(
        'INVALID',
        `Deadline must be between ${bounds.start} and ${bounds.end}.`,
      )
    }
    const goal: MonthlyGoal = {
      id: newId(),
      cycleId,
      sessionKey: `monthly:${cycleId}`,
      title: text(input.title, 'Goal title'),
      description: text(input.description, 'Description', false),
      reason: text(input.reason, 'Why you want it'),
      importance: text(input.importance, 'Why it is important'),
      actionPlan: text(input.actionPlan, 'Action plan'),
      obstacles: text(input.obstacles, 'Obstacles'),
      prevention: text(input.prevention, 'Prevention strategy'),
      deadline,
      status: 'pending',
      completedAt: null,
      createdAt: this.now().toISOString(),
    }
    await this.storage.put('monthlyGoals', goal)
    if (!(await this.getAnchor())) {
      // The 22nd is day one, so the first weekly session is the 28th (day seven).
      await this.setSetting('weeklyAnchor', addDays(cycleId, 7))
    }
    return goal
  }

  async updateMonthlyGoal(id: string, input: MonthlyGoalInput): Promise<MonthlyGoal> {
    const goal = await this.mustGet<MonthlyGoal>('monthlyGoals', id)
    await this.requireOpen(goal.sessionKey, 'This monthly goal')
    const bounds = cycleBounds(goal.cycleId)
    const deadline = input.deadline ?? goal.deadline
    if (!isValidDateStr(deadline) || deadline < bounds.start || deadline > bounds.end) {
      throw new PlanningError('INVALID', 'Deadline is outside the monthly cycle.')
    }
    const next: MonthlyGoal = {
      ...goal,
      title: text(input.title, 'Goal title'),
      description: text(input.description, 'Description', false),
      reason: text(input.reason, 'Why you want it'),
      importance: text(input.importance, 'Why it is important'),
      actionPlan: text(input.actionPlan, 'Action plan'),
      obstacles: text(input.obstacles, 'Obstacles'),
      prevention: text(input.prevention, 'Prevention strategy'),
      deadline,
    }
    await this.storage.put('monthlyGoals', next)
    return next
  }

  async deleteMonthlyGoal(id: string): Promise<void> {
    const goal = await this.mustGet<MonthlyGoal>('monthlyGoals', id)
    await this.requireOpen(goal.sessionKey, 'This monthly goal')
    await this.storage.delete('monthlyGoals', id)
    const tasks = await this.storage.getAll<DailyTask>('dailyTasks')
    for (const t of tasks) {
      if (t.monthlyGoalId === id) await this.storage.put('dailyTasks', { ...t, monthlyGoalId: null })
    }
  }

  async addReward(rewardText: string): Promise<Reward> {
    const cycleId = await this.requireMonthlyDay('The monthly reward')
    const reward: Reward = {
      id: newId(),
      cycleId,
      sessionKey: `monthly:${cycleId}`,
      text: text(rewardText, 'Reward'),
      createdAt: this.now().toISOString(),
    }
    await this.storage.put('rewards', reward)
    return reward
  }

  async updateReward(id: string, rewardText: string): Promise<Reward> {
    const reward = await this.mustGet<Reward>('rewards', id)
    await this.requireOpen(reward.sessionKey, 'The monthly reward')
    const next = { ...reward, text: text(rewardText, 'Reward') }
    await this.storage.put('rewards', next)
    return next
  }

  async deleteReward(id: string): Promise<void> {
    const reward = await this.mustGet<Reward>('rewards', id)
    await this.requireOpen(reward.sessionKey, 'The monthly reward')
    await this.storage.delete('rewards', id)
  }

  // ---------- weekly ----------

  async addWeeklyGoal(input: WeeklyGoalInput): Promise<WeeklyGoal> {
    const anchor = await this.getAnchor()
    const state = getPlanningState(this.now(), anchor)
    if (!state.weekly.open || !state.weekly.sessionDate) {
      throw new PlanningError('CLOSED', state.weekly.reason)
    }
    const sessionDate = state.weekly.sessionDate
    const { start, end } = weeklyPeriod(sessionDate)
    const monthlyGoalId = await this.validMonthlyLink(input.monthlyGoalId, state.activeCycleId)
    const deadline = input.deadline ?? end
    if (!isValidDateStr(deadline) || deadline < start || deadline > end) {
      throw new PlanningError('INVALID', `Deadline must be between ${start} and ${end}.`)
    }
    const goal: WeeklyGoal = {
      id: newId(),
      sessionDate,
      sessionKey: `weekly:${sessionDate}`,
      periodStart: start,
      periodEnd: end,
      title: text(input.title, 'Goal title'),
      description: text(input.description, 'Description', false),
      reason: text(input.reason, 'Why you want it'),
      actionPlan: text(input.actionPlan, 'How you will make sure you achieve it'),
      obstacles: text(input.obstacles, 'Obstacles'),
      prevention: text(input.prevention, 'Prevention strategy'),
      monthlyGoalId,
      deadline,
      status: 'pending',
      completedAt: null,
      createdAt: this.now().toISOString(),
    }
    await this.storage.put('weeklyGoals', goal)
    return goal
  }

  async updateWeeklyGoal(id: string, input: WeeklyGoalInput): Promise<WeeklyGoal> {
    const goal = await this.mustGet<WeeklyGoal>('weeklyGoals', id)
    await this.requireOpen(goal.sessionKey, 'This weekly goal')
    const monthlyGoalId = await this.validMonthlyLink(
      input.monthlyGoalId,
      getPlanningState(this.now(), await this.getAnchor()).activeCycleId,
    )
    const deadline = input.deadline ?? goal.deadline
    if (!isValidDateStr(deadline) || deadline < goal.periodStart || deadline > goal.periodEnd) {
      throw new PlanningError('INVALID', 'Deadline is outside the weekly period.')
    }
    const next: WeeklyGoal = {
      ...goal,
      title: text(input.title, 'Goal title'),
      description: text(input.description, 'Description', false),
      reason: text(input.reason, 'Why you want it'),
      actionPlan: text(input.actionPlan, 'How you will make sure you achieve it'),
      obstacles: text(input.obstacles, 'Obstacles'),
      prevention: text(input.prevention, 'Prevention strategy'),
      monthlyGoalId,
      deadline,
    }
    await this.storage.put('weeklyGoals', next)
    return next
  }

  async deleteWeeklyGoal(id: string): Promise<void> {
    const goal = await this.mustGet<WeeklyGoal>('weeklyGoals', id)
    await this.requireOpen(goal.sessionKey, 'This weekly goal')
    await this.storage.delete('weeklyGoals', id)
    const tasks = await this.storage.getAll<DailyTask>('dailyTasks')
    for (const t of tasks) {
      if (t.weeklyGoalId === id) await this.storage.put('dailyTasks', { ...t, weeklyGoalId: null })
    }
  }

  private async validMonthlyLink(
    id: string | null | undefined,
    activeCycle: DateStr | null,
  ): Promise<string | null> {
    if (!id) return null
    const goal = await this.storage.get<MonthlyGoal>('monthlyGoals', id)
    if (!goal) throw new PlanningError('NOT_FOUND', 'The linked monthly goal does not exist.')
    if (activeCycle && goal.cycleId !== activeCycle && !isMonthlyDay(toDateStr(this.now()))) {
      throw new PlanningError('INVALID', 'Link a goal from the current monthly cycle.')
    }
    return id
  }

  // ---------- daily ----------

  private async dailyPlanTarget() {
    const anchor = await this.getAnchor()
    const state = getPlanningState(this.now(), anchor)
    if (!state.daily.open || !state.daily.via) {
      throw new PlanningError('CLOSED', state.daily.reason)
    }
    return state
  }

  private async validateTask(input: DailyTaskInput) {
    const title = text(input.title, 'Task title')
    if (!isValidTime(input.start)) throw new PlanningError('INVALID', 'Start time must be HH:MM.')
    if (!isValidTime(input.end)) throw new PlanningError('INVALID', 'Finish time must be HH:MM.')
    const overnight = !!input.overnight
    const s = minutesOfTime(input.start)
    const e = minutesOfTime(input.end)
    if (!overnight && e <= s) {
      throw new PlanningError(
        'INVALID',
        'Finish time must be later than the start time. Mark the task as overnight if it runs past midnight.',
      )
    }
    if (overnight && e >= s) {
      throw new PlanningError(
        'INVALID',
        'An overnight task must finish earlier in the clock than it starts (for example 22:00 to 01:00).',
      )
    }
    const weeklyGoalId = input.weeklyGoalId || null
    const monthlyGoalId = input.monthlyGoalId || null
    if (weeklyGoalId && !(await this.storage.get('weeklyGoals', weeklyGoalId))) {
      throw new PlanningError('NOT_FOUND', 'The linked weekly goal does not exist.')
    }
    if (monthlyGoalId && !(await this.storage.get('monthlyGoals', monthlyGoalId))) {
      throw new PlanningError('NOT_FOUND', 'The linked monthly goal does not exist.')
    }
    return {
      title,
      description: text(input.description, 'Description', false),
      weeklyGoalId,
      monthlyGoalId,
      start: input.start,
      end: input.end,
      overnight,
      durationMinutes: taskDuration(input.start, input.end, overnight),
      obstacles: text(input.obstacles, 'Obstacles'),
      prevention: text(input.prevention, 'Prevention strategy'),
    }
  }

  /**
   * Creates a task for tomorrow. On the 21st this is the monthly session's
   * "prepare the 22nd" section; otherwise it needs the 21:00–22:00 window.
   */
  async addDailyTask(input: DailyTaskInput): Promise<DailyTask> {
    const state = await this.dailyPlanTarget()
    if (input.date && input.date !== state.daily.targetDate) {
      throw new PlanningError('INVALID', 'Daily tasks can only be created for tomorrow.')
    }
    const fields = await this.validateTask(input)
    const task: DailyTask = {
      id: newId(),
      date: state.daily.targetDate,
      plannedOn: state.today,
      sessionKey: `${state.daily.via === 'monthly' ? 'monthly' : 'daily'}:${state.today}`,
      ...fields,
      status: 'pending',
      completedAt: null,
      createdAt: this.now().toISOString(),
    }
    await this.storage.put('dailyTasks', task)
    return task
  }

  async updateDailyTask(id: string, input: DailyTaskInput): Promise<DailyTask> {
    const task = await this.mustGet<DailyTask>('dailyTasks', id)
    await this.requireOpen(task.sessionKey, 'This daily task')
    const fields = await this.validateTask(input)
    const next: DailyTask = { ...task, ...fields }
    await this.storage.put('dailyTasks', next)
    return next
  }

  async deleteDailyTask(id: string): Promise<void> {
    const task = await this.mustGet<DailyTask>('dailyTasks', id)
    await this.requireOpen(task.sessionKey, 'This daily task')
    await this.storage.delete('dailyTasks', id)
  }

  // ---------- completion ----------

  /** The only change allowed on a locked commitment. Never automatic. */
  async setCompleted(kind: ItemKind, id: string, completed: boolean): Promise<void> {
    const store =
      kind === 'monthly' ? 'monthlyGoals' : kind === 'weekly' ? 'weeklyGoals' : 'dailyTasks'
    const item = await this.mustGet<MonthlyGoal | WeeklyGoal | DailyTask>(store, id)
    const today = toDateStr(this.now())
    if (kind === 'monthly' && today <= (item as MonthlyGoal).cycleId) {
      throw new PlanningError('NOT_ALLOWED', 'Execution begins on the 22nd.')
    }
    if (kind === 'weekly' && today <= (item as WeeklyGoal).sessionDate) {
      throw new PlanningError('NOT_ALLOWED', 'This week starts the day after planning.')
    }
    if (kind === 'daily' && today < (item as DailyTask).date) {
      throw new PlanningError('NOT_ALLOWED', 'This task is for a future day.')
    }
    await this.storage.put(store, {
      ...item,
      status: completed ? 'completed' : 'pending',
      completedAt: completed ? this.now().toISOString() : null,
    })
  }

  // ---------- reflections & reviews ----------

  async addReflection(
    kind: ItemKind,
    itemId: string,
    input: ReflectionInput,
  ): Promise<Reflection> {
    const store =
      kind === 'monthly' ? 'monthlyGoals' : kind === 'weekly' ? 'weeklyGoals' : 'dailyTasks'
    const item = await this.mustGet<MonthlyGoal | WeeklyGoal | DailyTask>(store, itemId)
    if (item.status === 'completed') {
      throw new PlanningError('NOT_ALLOWED', 'Only incomplete commitments need a reflection.')
    }
    if (this.now().getTime() <= deadlineOf(kind, item).getTime()) {
      throw new PlanningError('NOT_ALLOWED', 'Reflection opens after the deadline has passed.')
    }
    const id = `${kind}:${itemId}`
    if (await this.storage.get('reflections', id)) {
      throw new PlanningError('EXISTS', 'A reflection is already recorded for this commitment.')
    }
    const reflection: Reflection = {
      id,
      kind,
      itemId,
      why: text(input.why, 'Why you did not achieve it'),
      prevented: text(input.prevented, 'What prevented you'),
      avoidable: text(input.avoidable, 'Whether it was avoidable'),
      different: text(input.different, 'What you could have done differently'),
      change: text(input.change, 'What you will change next time'),
      createdAt: this.now().toISOString(),
    }
    await this.storage.put('reflections', reflection)
    return reflection
  }

  /** Keeps the stored result of every finished cycle in sync with its goals. */
  async syncCycleResults(): Promise<void> {
    const today = toDateStr(this.now())
    const goals = await this.storage.getAll<MonthlyGoal>('monthlyGoals')
    const reviews = await this.storage.getAll<CycleReview>('reviews')
    const cycles = new Set(goals.map((g) => g.cycleId))
    for (const cycleId of cycles) {
      if (!cycleHasEnded(cycleId, today)) continue
      const cg = goals.filter((g) => g.cycleId === cycleId)
      const completed = cg.filter((g) => g.status === 'completed').length
      const earned = goalsAllCompleted(cg)
      const existing = reviews.find((r) => r.id === cycleId)
      if (
        existing &&
        existing.total === cg.length &&
        existing.completed === completed &&
        existing.rewardEarned === earned
      ) {
        continue
      }
      await this.storage.put<CycleReview>('reviews', {
        whyFailed: '',
        learned: '',
        improve: '',
        reviewedAt: null,
        ...existing,
        id: cycleId,
        total: cg.length,
        completed,
        rewardEarned: earned,
        updatedAt: this.now().toISOString(),
      })
    }
  }

  async saveReview(cycleId: DateStr, input: ReviewInput): Promise<CycleReview> {
    const today = toDateStr(this.now())
    if (!cycleHasEnded(cycleId, today)) {
      throw new PlanningError('NOT_ALLOWED', 'The monthly review opens after the cycle ends.')
    }
    await this.syncCycleResults()
    const existing = await this.storage.get<CycleReview>('reviews', cycleId)
    if (!existing) throw new PlanningError('NOT_FOUND', 'No monthly plan exists for that cycle.')
    if (existing.reviewedAt) {
      throw new PlanningError('EXISTS', 'This monthly review has already been recorded.')
    }
    const incomplete = existing.total - existing.completed
    const next: CycleReview = {
      ...existing,
      whyFailed: text(input.whyFailed, 'Why you failed', incomplete > 0),
      learned: text(input.learned, 'What you learned'),
      improve: text(input.improve, 'What you will improve next month'),
      reviewedAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    }
    await this.storage.put('reviews', next)
    return next
  }

  // ---------- helpers ----------

  private async mustGet<T>(store: Parameters<Storage['get']>[0], id: string): Promise<T> {
    const v = await this.storage.get<T>(store, id)
    if (!v) throw new PlanningError('NOT_FOUND', 'That record no longer exists.')
    return v
  }
}
