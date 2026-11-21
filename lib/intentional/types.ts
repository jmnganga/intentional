import type { DateStr, TimeStr } from './dates'

export type Status = 'pending' | 'completed'

export interface MonthlyGoal {
  id: string
  cycleId: DateStr // the 21st on which this goal was planned
  sessionKey: string
  title: string
  description: string
  reason: string
  importance: string
  actionPlan: string
  obstacles: string
  prevention: string
  deadline: DateStr
  status: Status
  completedAt: string | null
  createdAt: string
}

export interface Reward {
  id: string
  cycleId: DateStr
  sessionKey: string
  text: string
  createdAt: string
}

export interface WeeklyGoal {
  id: string
  sessionDate: DateStr // the rolling weekly planning date
  sessionKey: string
  periodStart: DateStr
  periodEnd: DateStr
  title: string
  description: string
  reason: string
  actionPlan: string
  obstacles: string
  prevention: string
  monthlyGoalId: string | null
  deadline: DateStr
  status: Status
  completedAt: string | null
  createdAt: string
}

export interface DailyTask {
  id: string
  date: DateStr // the day the task must be executed
  plannedOn: DateStr
  sessionKey: string
  title: string
  description: string
  weeklyGoalId: string | null
  monthlyGoalId: string | null
  start: TimeStr
  end: TimeStr
  overnight: boolean
  durationMinutes: number
  obstacles: string
  prevention: string
  status: Status
  completedAt: string | null
  createdAt: string
}

export type ItemKind = 'monthly' | 'weekly' | 'daily'

export interface Reflection {
  id: string // `${kind}:${itemId}`
  kind: ItemKind
  itemId: string
  why: string
  prevented: string
  avoidable: string
  different: string
  change: string
  createdAt: string
}

export interface CycleReview {
  id: DateStr // cycleId
  total: number
  completed: number
  rewardEarned: boolean
  whyFailed: string
  learned: string
  improve: string
  reviewedAt: string | null
  updatedAt: string
}

export interface SettingRecord {
  id: string
  value: unknown
}

export interface NotificationPrefs {
  enabled: boolean
  monthly: boolean
  weekly: boolean
  daily: boolean
  closing: boolean
  deadlines: boolean
  deadlineLeadMinutes: number
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  monthly: true,
  weekly: true,
  daily: true,
  closing: true,
  deadlines: true,
  deadlineLeadMinutes: 10,
}

export interface Snapshot {
  monthlyGoals: MonthlyGoal[]
  rewards: Reward[]
  weeklyGoals: WeeklyGoal[]
  dailyTasks: DailyTask[]
  reflections: Reflection[]
  reviews: CycleReview[]
  anchor: DateStr | null
  notificationPrefs: NotificationPrefs
  lastBackupAt: string | null
}

export type AnyItem = MonthlyGoal | WeeklyGoal | DailyTask
