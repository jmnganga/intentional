import {
  addDays,
  dateAt,
  dayOfMonth,
  diffDays,
  formatDate,
  minutesOfDay,
  parseDate,
  toDateStr,
  ymd,
  type DateStr,
} from './dates'

export const MONTHLY_DAY = 21
export const WINDOW_OPEN_MINUTES = 21 * 60
export const WINDOW_CLOSE_MINUTES = 22 * 60

export type Phase =
  | 'REFLECTION DAY'
  | 'MONTHLY REVIEW'
  | 'PLANNING OPEN'
  | 'PLANNING CLOSED'
  | 'EXECUTION MODE'

export function isMonthlyDay(date: DateStr): boolean {
  return dayOfMonth(date) === MONTHLY_DAY
}

/** Evening planning window: 21:00 inclusive to 22:00 exclusive, local time. */
export function inEveningWindow(now: Date): boolean {
  const m = minutesOfDay(now)
  return m >= WINDOW_OPEN_MINUTES && m < WINDOW_CLOSE_MINUTES
}

export interface CycleBounds {
  id: DateStr
  start: DateStr // the 22nd
  end: DateStr // the 20th of the following month
}

/** A monthly cycle is identified by the 21st it was planned on. */
export function cycleBounds(cycleId: DateStr): CycleBounds {
  const { y, m } = parseDate(cycleId)
  return { id: cycleId, start: addDays(cycleId, 1), end: ymd(y, m + 1, 20) }
}

/** The cycle being executed on `date`. On the 21st no cycle is executing. */
export function activeCycleId(date: DateStr): DateStr | null {
  const { y, m, d } = parseDate(date)
  if (d === MONTHLY_DAY) return null
  if (d > MONTHLY_DAY) return ymd(y, m, MONTHLY_DAY)
  return ymd(y, m - 1, MONTHLY_DAY)
}

/** On a 21st: the cycle that just finished on the 20th. */
export function endedCycleIdOn(planningDay: DateStr): DateStr {
  const { y, m } = parseDate(planningDay)
  return ymd(y, m - 1, MONTHLY_DAY)
}

export function cycleHasEnded(cycleId: DateStr, today: DateStr): boolean {
  return today > cycleBounds(cycleId).end
}

/** Rolling seven-day weekly schedule: anchor + 7k days, across any month boundary. */
export function isWeeklyDate(anchor: DateStr | null, date: DateStr): boolean {
  if (!anchor) return false
  const diff = diffDays(anchor, date)
  return diff >= 0 && diff % 7 === 0
}

export function nextWeeklyDateOnOrAfter(anchor: DateStr, date: DateStr): DateStr {
  const diff = diffDays(anchor, date)
  if (diff <= 0) return anchor
  return addDays(anchor, Math.ceil(diff / 7) * 7)
}

export interface WeeklySlot {
  date: DateStr
  /** The monthly planning day takes priority; this weekly session is superseded. */
  conflict: boolean
}

export function weeklySchedule(anchor: DateStr, from: DateStr, count: number): WeeklySlot[] {
  const slots: WeeklySlot[] = []
  let date = nextWeeklyDateOnOrAfter(anchor, from)
  for (let i = 0; i < count; i++) {
    slots.push({ date, conflict: isMonthlyDay(date) })
    date = addDays(date, 7)
  }
  return slots
}

export function weeklyPeriod(sessionDate: DateStr): { start: DateStr; end: DateStr } {
  return { start: addDays(sessionDate, 1), end: addDays(sessionDate, 7) }
}

export interface PlanningWindow {
  kind: 'monthly' | 'weekly' | 'daily'
  date: DateStr
  label: string
  start: Date
  end: Date
  targetDate: DateStr
  includesDaily: boolean
  open: boolean
}

/** Every planning window that has not finished yet, soonest first. */
export function upcomingWindows(
  now: Date,
  anchor: DateStr | null,
  days = 62,
): PlanningWindow[] {
  const today = toDateStr(now)
  const out: PlanningWindow[] = []
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i)
    let w: PlanningWindow
    if (isMonthlyDay(date)) {
      w = {
        kind: 'monthly',
        date,
        label: 'Monthly planning + tomorrow (22nd)',
        start: dateAt(date, '00:00'),
        end: dateAt(date, '00:00', 1),
        targetDate: addDays(date, 1),
        includesDaily: true,
        open: false,
      }
    } else if (isWeeklyDate(anchor, date)) {
      w = {
        kind: 'weekly',
        date,
        label: 'Weekly + daily planning',
        start: dateAt(date, '21:00'),
        end: dateAt(date, '22:00'),
        targetDate: addDays(date, 1),
        includesDaily: true,
        open: false,
      }
    } else {
      w = {
        kind: 'daily',
        date,
        label: 'Daily planning',
        start: dateAt(date, '21:00'),
        end: dateAt(date, '22:00'),
        targetDate: addDays(date, 1),
        includesDaily: true,
        open: false,
      }
    }
    if (w.end.getTime() <= now.getTime()) continue
    w.open = w.start.getTime() <= now.getTime()
    out.push(w)
  }
  return out
}

export interface PlanningState {
  today: DateStr
  tomorrow: DateStr
  eveningWindowOpen: boolean
  isMonthlyDay: boolean
  activeCycleId: DateStr | null
  monthly: {
    open: boolean
    cycleId: DateStr | null // cycle that can be planned right now
    endedCycleId: DateStr | null // cycle to review right now
    reason: string
  }
  weekly: {
    open: boolean
    scheduledToday: boolean
    conflict: boolean
    sessionDate: DateStr | null
    periodStart: DateStr | null
    periodEnd: DateStr | null
    reason: string
  }
  daily: {
    open: boolean
    via: 'monthly' | 'daily' | null
    targetDate: DateStr
    /** Normal (stand-alone) daily planning; never open on the 21st. */
    separateWindowOpen: boolean
    reason: string
  }
  phase: Phase
  next: PlanningWindow | null
  nextMonthly: PlanningWindow | null
  nextWeekly: PlanningWindow | null
  nextDaily: PlanningWindow | null
}

export function getPlanningState(
  now: Date,
  anchor: DateStr | null,
  opts: { reviewPending?: boolean; hasActiveCycle?: boolean } = {},
): PlanningState {
  const today = toDateStr(now)
  const tomorrow = addDays(today, 1)
  const monthlyDay = isMonthlyDay(today)
  const evening = inEveningWindow(now)
  const windows = upcomingWindows(now, anchor, 400)
  const nextMonthly = windows.find((w) => w.kind === 'monthly') ?? null
  const nextWeekly = windows.find((w) => w.kind === 'weekly') ?? null
  const nextDaily = windows.find((w) => w.kind === 'daily' || w.kind === 'weekly') ?? null
  const next = windows[0] ?? null

  const monthly = {
    open: monthlyDay,
    cycleId: monthlyDay ? today : null,
    endedCycleId: monthlyDay ? endedCycleIdOn(today) : null,
    reason: monthlyDay
      ? 'Monthly planning is open until midnight.'
      : `Monthly planning only opens on the ${MONTHLY_DAY}st. Next: ${
          nextMonthly ? formatDate(nextMonthly.date) : 'the 21st'
        }.`,
  }

  const scheduledToday = isWeeklyDate(anchor, today)
  const conflict = scheduledToday && monthlyDay
  const weeklyOpen = scheduledToday && !conflict && evening
  const period = scheduledToday && !conflict ? weeklyPeriod(today) : null
  let weeklyReason: string
  if (!anchor) {
    weeklyReason = 'Weekly planning begins once your first monthly plan is saved.'
  } else if (conflict) {
    weeklyReason = `This weekly session falls on the ${MONTHLY_DAY}st. Monthly planning takes priority, so it is skipped. The rolling schedule is not moved.`
  } else if (weeklyOpen) {
    weeklyReason = 'Weekly planning is open until 22:00.'
  } else if (scheduledToday && minutesOfDay(now) >= 22 * 60) {
    weeklyReason = 'The weekly planning window closed at 22:00.'
  } else if (scheduledToday) {
    weeklyReason = 'Weekly planning opens at 21:00 tonight.'
  } else {
    const n = nextWeekly
    weeklyReason = n
      ? `Weekly planning only happens every 7 days. Next: ${formatDate(n.date)} at 21:00.`
      : 'No weekly session scheduled.'
  }

  const weekly = {
    open: weeklyOpen,
    scheduledToday,
    conflict,
    sessionDate: scheduledToday && !conflict ? today : null,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    reason: weeklyReason,
  }

  let dailyOpen = false
  let via: 'monthly' | 'daily' | null = null
  let dailyReason: string
  if (monthlyDay) {
    dailyOpen = true
    via = 'monthly'
    dailyReason =
      'The 22nd is planned inside monthly planning (open until midnight). Normal daily planning is not available on the 21st.'
  } else if (evening) {
    dailyOpen = true
    via = 'daily'
    dailyReason = `Daily planning for ${formatDate(tomorrow)} is open until 22:00.`
  } else if (minutesOfDay(now) >= WINDOW_CLOSE_MINUTES) {
    dailyReason = 'The daily planning window closed at 22:00.'
  } else {
    dailyReason = 'Daily planning opens at 21:00 tonight.'
  }
  const daily = {
    open: dailyOpen,
    via,
    targetDate: tomorrow,
    separateWindowOpen: !monthlyDay && evening,
    reason: dailyReason,
  }

  const anyOpen = monthly.open || weekly.open || daily.open
  let phase: Phase
  if (monthlyDay) {
    phase = opts.reviewPending ? 'MONTHLY REVIEW' : 'REFLECTION DAY'
  } else if (anyOpen) {
    phase = 'PLANNING OPEN'
  } else if (minutesOfDay(now) >= WINDOW_CLOSE_MINUTES) {
    phase = 'PLANNING CLOSED'
  } else if (opts.hasActiveCycle) {
    phase = 'EXECUTION MODE'
  } else {
    phase = 'PLANNING CLOSED'
  }

  return {
    today,
    tomorrow,
    eveningWindowOpen: evening,
    isMonthlyDay: monthlyDay,
    activeCycleId: activeCycleId(today),
    monthly,
    weekly,
    daily,
    phase,
    next,
    nextMonthly,
    nextWeekly,
    nextDaily,
  }
}

/** Business-logic lock check used before every write. Never trusts the UI. */
export function isSessionOpen(sessionKey: string, now: Date, anchor: DateStr | null): boolean {
  const [kind, date] = sessionKey.split(':')
  const today = toDateStr(now)
  if (date !== today) return false
  if (kind === 'monthly') return isMonthlyDay(today)
  if (kind === 'weekly') {
    return inEveningWindow(now) && isWeeklyDate(anchor, today) && !isMonthlyDay(today)
  }
  if (kind === 'daily') return inEveningWindow(now) && !isMonthlyDay(today)
  return false
}
