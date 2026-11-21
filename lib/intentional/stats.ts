import { dateAt, endOfDay } from './dates'
import type { DailyTask, ItemKind, MonthlyGoal, Reward, WeeklyGoal } from './types'

type AnyItem = MonthlyGoal | WeeklyGoal | DailyTask

export function deadlineOf(kind: ItemKind, item: AnyItem): Date {
  if (kind === 'daily') {
    const t = item as DailyTask
    return dateAt(t.date, t.end, t.overnight ? 1 : 0)
  }
  return endOfDay((item as MonthlyGoal | WeeklyGoal).deadline)
}

/**
 * Missed = still pending after the deadline, or completed after the deadline.
 * Nothing is ever auto-completed.
 */
export function isMissed(kind: ItemKind, item: AnyItem, now: Date): boolean {
  const deadline = deadlineOf(kind, item)
  if (item.status === 'pending') return now.getTime() > deadline.getTime()
  return item.completedAt ? new Date(item.completedAt).getTime() > deadline.getTime() : false
}

export interface Summary {
  total: number
  completed: number
  incomplete: number
  missed: number
  percent: number
}

export function summarize(kind: ItemKind, items: AnyItem[], now: Date): Summary {
  const total = items.length
  const completed = items.filter((i) => i.status === 'completed').length
  const missed = items.filter((i) => isMissed(kind, i, now)).length
  return {
    total,
    completed,
    incomplete: total - completed,
    missed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}

export type RewardStatus = 'no-reward' | 'earned' | 'not-earned'

/** Earned only when there is at least one goal, every goal is completed, and a reward was set. */
export function rewardStatus(goals: MonthlyGoal[], rewards: Reward[]): RewardStatus {
  if (rewards.length === 0) return 'no-reward'
  const all = goals.length > 0 && goals.every((g) => g.status === 'completed')
  return all ? 'earned' : 'not-earned'
}

export function goalsAllCompleted(goals: MonthlyGoal[]): boolean {
  return goals.length > 0 && goals.every((g) => g.status === 'completed')
}
