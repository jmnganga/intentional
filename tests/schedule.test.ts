import { describe, expect, it } from 'vitest'
import { addDays, diffDays } from '../lib/intentional/dates'
import {
  activeCycleId,
  cycleBounds,
  getPlanningState,
  isWeeklyDate,
  weeklySchedule,
} from '../lib/intentional/schedule'

const at = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) =>
  new Date(y, m - 1, d, hh, mm, ss)
const ANCHOR = '2026-11-28'

describe('monthly planning window (21st)', () => {
  it('Test 1: Nov 21 monthly planning is open all day', () => {
    for (const [h, m, s] of [[0, 0, 0], [12, 30, 0], [23, 59, 59]]) {
      expect(getPlanningState(at(2026, 11, 21, h, m, s), null).monthly.open).toBe(true)
    }
  })

  it('Test 7: Nov 22 monthly planning is locked (and Nov 20 too)', () => {
    expect(getPlanningState(at(2026, 11, 22, 0, 0, 0), ANCHOR).monthly.open).toBe(false)
    expect(getPlanningState(at(2026, 11, 22, 21, 30), ANCHOR).monthly.open).toBe(false)
    expect(getPlanningState(at(2026, 11, 20, 23, 59, 59), ANCHOR).monthly.open).toBe(false)
  })
})

describe('21st exception for daily planning', () => {
  it('Test 2: on Nov 21 the 22nd is planned inside the monthly session', () => {
    const s = getPlanningState(at(2026, 11, 21, 9, 0), ANCHOR)
    expect(s.daily.open).toBe(true)
    expect(s.daily.via).toBe('monthly')
    expect(s.daily.targetDate).toBe('2026-11-22')
  })

  it('Test 3: on Nov 21 normal daily planning is not separately available', () => {
    for (const h of [9, 21, 21.5]) {
      const s = getPlanningState(at(2026, 11, 21, Math.floor(h), (h % 1) * 60), ANCHOR)
      expect(s.daily.separateWindowOpen).toBe(false)
    }
  })

  it('Test 18: the 21st exception beats normal daily planning even inside 21:00-22:00', () => {
    const s = getPlanningState(at(2026, 11, 21, 21, 30), ANCHOR)
    expect(s.daily.via).toBe('monthly')
    expect(s.daily.separateWindowOpen).toBe(false)
    expect(s.phase).toBe('REFLECTION DAY')
  })
})

describe('daily window boundaries', () => {
  it('Test 4: Nov 22 at 20:59 daily planning is closed', () => {
    expect(getPlanningState(at(2026, 11, 22, 20, 59, 59), ANCHOR).daily.open).toBe(false)
  })
  it('Test 5: Nov 22 at 21:00 daily planning opens for Nov 23', () => {
    const s = getPlanningState(at(2026, 11, 22, 21, 0, 0), ANCHOR)
    expect(s.daily.open).toBe(true)
    expect(s.daily.targetDate).toBe('2026-11-23')
    expect(s.daily.via).toBe('daily')
  })
  it('Test 6: Nov 22 at exactly 22:00 daily planning is closed', () => {
    expect(getPlanningState(at(2026, 11, 22, 21, 59, 59), ANCHOR).daily.open).toBe(true)
    expect(getPlanningState(at(2026, 11, 22, 22, 0, 0), ANCHOR).daily.open).toBe(false)
  })
})

describe('weekly rolling schedule', () => {
  it('Test 8: Nov 28 at 21:00 weekly planning is available', () => {
    const s = getPlanningState(at(2026, 11, 28, 21, 0, 0), ANCHOR)
    expect(s.weekly.open).toBe(true)
    expect(s.weekly.periodStart).toBe('2026-11-29')
    expect(s.weekly.periodEnd).toBe('2026-12-05')
    expect(s.daily.open).toBe(true)
    expect(s.daily.targetDate).toBe('2026-11-29')
  })

  it('Test 10: at exactly 22:00 weekly planning is closed', () => {
    expect(getPlanningState(at(2026, 11, 28, 21, 59, 59), ANCHOR).weekly.open).toBe(true)
    expect(getPlanningState(at(2026, 11, 28, 22, 0, 0), ANCHOR).weekly.open).toBe(false)
    expect(getPlanningState(at(2026, 11, 28, 20, 59, 59), ANCHOR).weekly.open).toBe(false)
  })

  it('weekly planning is not open on other days', () => {
    expect(getPlanningState(at(2026, 11, 29, 21, 30), ANCHOR).weekly.open).toBe(false)
    expect(getPlanningState(at(2026, 11, 27, 21, 30), ANCHOR).weekly.open).toBe(false)
  })

  it('Test 11: the next session is exactly seven calendar days later', () => {
    const slots = weeklySchedule(ANCHOR, '2026-11-28', 3)
    expect(slots.map((s) => s.date)).toEqual(['2026-11-28', '2026-12-05', '2026-12-12'])
    expect(isWeeklyDate(ANCHOR, '2026-12-05')).toBe(true)
    expect(isWeeklyDate(ANCHOR, '2026-12-04')).toBe(false)
  })

  it('Test 12: dates are correct across December, January and leap years', () => {
    const slots = weeklySchedule(ANCHOR, '2026-11-28', 10).map((s) => s.date)
    expect(slots.slice(0, 8)).toEqual([
      '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19',
      '2026-12-26', '2027-01-02', '2027-01-09', '2027-01-16',
    ])
    const leap = weeklySchedule('2028-02-22', '2028-02-22', 3).map((s) => s.date)
    expect(leap).toEqual(['2028-02-22', '2028-02-29', '2028-03-07'])
    const nonLeap = weeklySchedule('2027-02-22', '2027-02-22', 2).map((s) => s.date)
    expect(nonLeap).toEqual(['2027-02-22', '2027-03-01'])
    // every gap is exactly 7 days for years
    const long = weeklySchedule(ANCHOR, '2026-11-28', 400)
    for (let i = 1; i < long.length; i++) {
      expect(diffDays(long[i - 1].date, long[i].date)).toBe(7)
    }
  })

  it('the rolling counter is preserved when jumping later (not reset by month)', () => {
    expect(isWeeklyDate(ANCHOR, addDays(ANCHOR, 7 * 37))).toBe(true)
    expect(weeklySchedule(ANCHOR, '2027-03-01', 1)[0].date).toBe('2027-03-06')
  })

  it('a weekly date that lands on the 21st is superseded by monthly planning, not moved', () => {
    const anchor = '2026-11-14'
    const s = getPlanningState(at(2026, 11, 21, 21, 30), anchor)
    expect(s.weekly.conflict).toBe(true)
    expect(s.weekly.open).toBe(false)
    expect(s.monthly.open).toBe(true)
    expect(weeklySchedule(anchor, '2026-11-14', 3).map((x) => x.conflict)).toEqual([false, true, false])
    expect(isWeeklyDate(anchor, '2026-11-28')).toBe(true)
  })

  it('no weekly sessions exist before the first monthly plan', () => {
    expect(getPlanningState(at(2026, 11, 28, 21, 30), null).weekly.open).toBe(false)
  })
})

describe('cycles', () => {
  it('runs from the 22nd to the 20th of the next month', () => {
    expect(cycleBounds('2026-11-21')).toEqual({ id: '2026-11-21', start: '2026-11-22', end: '2026-12-20' })
    expect(cycleBounds('2026-12-21').end).toBe('2027-01-20')
    expect(activeCycleId('2026-12-20')).toBe('2026-11-21')
    expect(activeCycleId('2026-12-22')).toBe('2026-12-21')
    expect(activeCycleId('2026-12-21')).toBeNull()
    expect(activeCycleId('2027-01-05')).toBe('2026-12-21')
  })
})

describe('phases and next window', () => {
  it('reports status and next eligible window', () => {
    const open = getPlanningState(at(2026, 11, 22, 21, 30), ANCHOR, { hasActiveCycle: true })
    expect(open.phase).toBe('PLANNING OPEN')
    const closed = getPlanningState(at(2026, 11, 22, 22, 30), ANCHOR, { hasActiveCycle: true })
    expect(closed.phase).toBe('PLANNING CLOSED')
    expect(closed.next?.date).toBe('2026-11-23')
    const exec = getPlanningState(at(2026, 11, 23, 14, 0), ANCHOR, { hasActiveCycle: true })
    expect(exec.phase).toBe('EXECUTION MODE')
    expect(exec.next?.start.getHours()).toBe(21)
    const review = getPlanningState(at(2026, 12, 21, 10, 0), ANCHOR, { reviewPending: true })
    expect(review.phase).toBe('MONTHLY REVIEW')
  })
})
