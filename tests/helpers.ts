import { Intentional, type Clock } from '../lib/intentional/service'
import { MemoryStorage, type Storage } from '../lib/intentional/storage'

export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current.getTime())
  }
  set(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
    this.current = new Date(y, m - 1, d, hh, mm, ss, 0)
  }
}

export function setup(storage: Storage = new MemoryStorage()) {
  const clock = new FakeClock(new Date(2026, 10, 21, 10, 0, 0))
  const app = new Intentional(storage, clock)
  return { clock, app, storage }
}

export const monthlyInput = (title = 'Read two books') => ({
  title,
  reason: 'I want a calmer mind',
  importance: 'Reading shapes who I become',
  actionPlan: '30 pages every morning',
  obstacles: 'Phone distractions',
  prevention: 'Phone stays in another room',
})

export const weeklyInput = (title = 'Finish chapter 1') => ({
  title,
  reason: 'Part of my monthly goal',
  actionPlan: 'Read before breakfast',
  obstacles: 'Sleeping in',
  prevention: 'Alarm at 06:00',
})

export const taskInput = (title = 'Read 30 pages', start = '06:00', end = '07:00') => ({
  title,
  start,
  end,
  obstacles: 'Tiredness',
  prevention: 'Sleep early',
})

export const reflection = {
  why: 'I ran out of time',
  prevented: 'Unplanned meeting',
  avoidable: 'Partly',
  different: 'Start earlier',
  change: 'Block the first hour',
}
