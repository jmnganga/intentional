import { Capacitor } from '@capacitor/core'
import { addDays, dateAt, toDateStr, type DateStr } from './dates'
import { isMonthlyDay, isWeeklyDate } from './schedule'
import { deadlineOf } from './stats'
import type { DailyTask, NotificationPrefs } from './types'

export interface PlannedNotification {
  key: string
  title: string
  body: string
  at: Date
}

const HORIZON_DAYS = 14
const MAX_SCHEDULED = 60

/** Pure planner: which local notifications should exist, given the current data. */
export function buildNotificationPlan(
  now: Date,
  anchor: DateStr | null,
  tasks: DailyTask[],
  prefs: NotificationPrefs,
): PlannedNotification[] {
  if (!prefs.enabled) return []
  const out: PlannedNotification[] = []
  const today = toDateStr(now)
  const add = (key: string, title: string, body: string, at: Date) => {
    if (at.getTime() > now.getTime()) out.push({ key, title, body, at })
  }

  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const date = addDays(today, i)
    if (isMonthlyDay(date)) {
      if (prefs.monthly) {
        add(
          `monthly-morning:${date}`,
          'Monthly planning day',
          'Reflect on the cycle, set your goals and reward, and prepare tomorrow (the 22nd).',
          dateAt(date, '09:00'),
        )
        add(
          `monthly-evening:${date}`,
          'Monthly planning + prepare the 22nd',
          'Finish your monthly goals and plan the 22nd before midnight. Then stop planning.',
          dateAt(date, '21:00'),
        )
      }
      if (prefs.closing) {
        add(
          `monthly-closing:${date}`,
          'Monthly planning closes at midnight',
          'Have you planned the 22nd? After midnight everything locks.',
          dateAt(date, '23:00'),
        )
      }
      continue
    }
    const weekly = isWeeklyDate(anchor, date)
    if (weekly && prefs.weekly) {
      add(
        `weekly:${date}`,
        'Weekly + daily planning open',
        'Set the next seven days, then plan tomorrow. The window closes at 22:00.',
        dateAt(date, '21:00'),
      )
    } else if (prefs.daily) {
      add(
        `daily:${date}`,
        'Plan tomorrow',
        'The daily planning window is open until 22:00.',
        dateAt(date, '21:00'),
      )
    }
    if (prefs.closing) {
      add(
        `closing:${date}`,
        'Planning closes at 22:00',
        'Fifteen minutes left to commit to tomorrow.',
        dateAt(date, '21:45'),
      )
    }
  }

  if (prefs.deadlines) {
    for (const t of tasks) {
      if (t.status !== 'pending') continue
      const deadline = deadlineOf('daily', t)
      const at = new Date(deadline.getTime() - prefs.deadlineLeadMinutes * 60_000)
      add(
        `deadline:${t.id}`,
        `Due soon: ${t.title}`,
        `Finish by ${t.end}.`,
        at,
      )
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED)
}

function numericId(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2147483647 || 1
}

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const current = await LocalNotifications.checkPermissions()
  if (current.display === 'granted') return true
  const res = await LocalNotifications.requestPermissions()
  return res.display === 'granted'
}

export async function notificationPermissionGranted(): Promise<boolean> {
  if (!notificationsSupported()) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return (await LocalNotifications.checkPermissions()).display === 'granted'
}

/** Replaces every pending local notification with the plan. Native Android only. */
export async function applyNotificationPlan(plan: PlannedNotification[]): Promise<void> {
  if (!notificationsSupported()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications })
  }
  if (plan.length === 0) return
  await LocalNotifications.schedule({
    notifications: plan.map((n) => ({
      id: numericId(n.key),
      title: n.title,
      body: n.body,
      schedule: { at: n.at, allowWhileIdle: true },
    })),
  })
}
