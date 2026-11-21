export type DateStr = string // local calendar date, YYYY-MM-DD
export type TimeStr = string // local time, HH:MM (24h)

const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(y: number, m: number, d: number): DateStr {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function parseDate(s: DateStr): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

/** The device's local calendar date for an instant. */
export function toDateStr(date: Date): DateStr {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Pure calendar arithmetic: independent of DST and month lengths. */
export function addDays(s: DateStr, n: number): DateStr {
  const { y, m, d } = parseDate(s)
  return ymd(y, m, d + n)
}

export function diffDays(a: DateStr, b: DateStr): number {
  const pa = parseDate(a)
  const pb = parseDate(b)
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000,
  )
}

export function dayOfMonth(s: DateStr): number {
  return parseDate(s).d
}

export function isValidDateStr(s: unknown): s is DateStr {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const { y, m, d } = parseDate(s)
  return ymd(y, m, d) === s
}

export function isValidTime(t: unknown): t is TimeStr {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

export function minutesOfTime(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** Local Date for a calendar date + HH:MM, optionally shifted by whole calendar days. */
export function dateAt(s: DateStr, time: TimeStr, extraDays = 0): Date {
  const { y, m, d } = parseDate(addDays(s, extraDays))
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

export function endOfDay(s: DateStr): Date {
  const { y, m, d } = parseDate(s)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export function formatDate(s: DateStr, opts?: Intl.DateTimeFormatOptions): string {
  const { y, m, d } = parseDate(s)
  return new Date(y, m - 1, d).toLocaleDateString(
    undefined,
    opts ?? { weekday: 'short', day: 'numeric', month: 'short' },
  )
}

export function formatDateLong(s: DateStr): string {
  return formatDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
