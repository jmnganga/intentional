import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { PlanningError, Intentional } from '../lib/intentional/service'
import { IndexedDbStorage } from '../lib/intentional/storage'
import { goalsAllCompleted, isMissed, rewardStatus, summarize } from '../lib/intentional/stats'
import { monthlyInput, reflection, setup, taskInput, weeklyInput } from './helpers'
import { FakeClock } from './helpers'

async function rejects(p: Promise<unknown>, code?: string) {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(PlanningError)
    if (code) expect((e as PlanningError).code).toBe(code)
    return
  }
  throw new Error('Expected the operation to be rejected')
}

describe('Test 13: writes outside a planning window are rejected', () => {
  it('rejects monthly goals, rewards, weekly goals and daily tasks when closed', async () => {
    const { app, clock } = setup()
    clock.set(2026, 11, 22, 10, 0)
    await rejects(app.addMonthlyGoal(monthlyInput()), 'CLOSED')
    await rejects(app.addReward('A trip'), 'CLOSED')
    clock.set(2026, 11, 22, 20, 59, 59)
    await rejects(app.addDailyTask(taskInput()), 'CLOSED')
    clock.set(2026, 11, 22, 22, 0, 0)
    await rejects(app.addDailyTask(taskInput()), 'CLOSED')
    clock.set(2026, 11, 22, 21, 0, 0)
    await expect(app.addDailyTask(taskInput())).resolves.toMatchObject({ date: '2026-11-23' })
  })

  it('rejects an explicit date that is not tomorrow', async () => {
    const { app, clock } = setup()
    clock.set(2026, 11, 22, 21, 10)
    await rejects(app.addDailyTask({ ...taskInput(), date: '2026-11-25' }), 'INVALID')
  })

  it('weekly goals are rejected on non-weekly dates and after 22:00', async () => {
    const { app, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    clock.set(2026, 11, 27, 21, 30)
    await rejects(app.addWeeklyGoal(weeklyInput()), 'CLOSED')
    clock.set(2026, 11, 28, 22, 0, 0)
    await rejects(app.addWeeklyGoal(weeklyInput()), 'CLOSED')
    clock.set(2026, 11, 28, 20, 59, 59)
    await rejects(app.addWeeklyGoal(weeklyInput()), 'CLOSED')
  })
})

describe('monthly planning and locking', () => {
  it('saves goals on the 21st, sets the rolling anchor to the 28th, and plans the 22nd', async () => {
    const { app, clock } = setup()
    const goal = await app.addMonthlyGoal(monthlyInput())
    expect(goal.deadline).toBe('2026-12-20')
    expect(await app.getAnchor()).toBe('2026-11-28')
    const task = await app.addDailyTask({ ...taskInput(), monthlyGoalId: goal.id })
    expect(task.date).toBe('2026-11-22')
    expect(task.sessionKey).toBe('monthly:2026-11-21')
    expect(task.durationMinutes).toBe(60)
    clock.set(2026, 11, 21, 23, 59, 59)
    await app.updateDailyTask(task.id, { ...taskInput('Read 40 pages') })
  })

  it('Test 17: rewards and goals cannot be changed after the 21st', async () => {
    const { app, clock } = setup()
    const goal = await app.addMonthlyGoal(monthlyInput())
    const reward = await app.addReward('New headphones')
    const task = await app.addDailyTask(taskInput())
    clock.set(2026, 11, 22, 0, 0, 0)
    await rejects(app.updateReward(reward.id, 'Something else'), 'LOCKED')
    await rejects(app.deleteReward(reward.id), 'LOCKED')
    await rejects(app.updateMonthlyGoal(goal.id, monthlyInput('Changed')), 'LOCKED')
    await rejects(app.deleteMonthlyGoal(goal.id), 'LOCKED')
    await rejects(app.updateDailyTask(task.id, taskInput('Changed')), 'LOCKED')
    await rejects(app.deleteDailyTask(task.id), 'LOCKED')
    const snap = await app.snapshot()
    expect(snap.rewards[0].text).toBe('New headphones')
    expect(snap.monthlyGoals[0].title).toBe('Read two books')
  })

  it('can edit and delete commitments while the window is still open', async () => {
    const { app } = setup()
    const goal = await app.addMonthlyGoal(monthlyInput())
    await app.updateMonthlyGoal(goal.id, monthlyInput('Read three books'))
    expect((await app.snapshot()).monthlyGoals[0].title).toBe('Read three books')
    await app.deleteMonthlyGoal(goal.id)
    expect((await app.snapshot()).monthlyGoals).toHaveLength(0)
  })

  it('validates required fields and task times', async () => {
    const { app } = setup()
    await rejects(app.addMonthlyGoal({ ...monthlyInput(), reason: '  ' }), 'INVALID')
    await rejects(app.addDailyTask({ ...taskInput(), start: '25:00' }), 'INVALID')
    await rejects(app.addDailyTask(taskInput('x', '10:00', '09:00')), 'INVALID')
    await rejects(app.addDailyTask(taskInput('x', '10:00', '10:00')), 'INVALID')
    const overnight = await app.addDailyTask({ ...taskInput('x', '22:00', '01:00'), overnight: true })
    expect(overnight.durationMinutes).toBe(180)
  })
})

describe('Test 9: weekly and daily planning on the same evening', () => {
  it('both can be completed in their separate sections on Nov 28', async () => {
    const { app, clock } = setup()
    const m = await app.addMonthlyGoal(monthlyInput())
    clock.set(2026, 11, 28, 21, 5)
    const w = await app.addWeeklyGoal({ ...weeklyInput(), monthlyGoalId: m.id })
    expect(w.periodStart).toBe('2026-11-29')
    expect(w.periodEnd).toBe('2026-12-05')
    expect(w.deadline).toBe('2026-12-05')
    const t = await app.addDailyTask({ ...taskInput(), weeklyGoalId: w.id, monthlyGoalId: m.id })
    expect(t.date).toBe('2026-11-29')
    expect(t.sessionKey).toBe('daily:2026-11-28')
    clock.set(2026, 11, 28, 22, 0, 0)
    await rejects(app.updateWeeklyGoal(w.id, weeklyInput('x')), 'LOCKED')
    await rejects(app.updateDailyTask(t.id, taskInput('x')), 'LOCKED')
  })

  it('a weekly session on the 21st is skipped and the schedule is not moved', async () => {
    const { app, clock, storage } = setup()
    await storage.put('settings', { id: 'weeklyAnchor', value: '2026-11-14' })
    clock.set(2026, 11, 21, 21, 30)
    await rejects(app.addWeeklyGoal(weeklyInput()), 'CLOSED')
    expect(await app.getAnchor()).toBe('2026-11-14')
  })
})

describe('accountability', () => {
  it('Test 16: an expired deadline never auto-completes a task', async () => {
    const { app, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    const task = await app.addDailyTask(taskInput('Run', '06:00', '07:00'))
    clock.set(2026, 11, 22, 12, 0)
    let snap = await app.snapshot()
    expect(snap.dailyTasks[0].status).toBe('pending')
    expect(isMissed('daily', snap.dailyTasks[0], clock.now())).toBe(true)
    expect(summarize('daily', snap.dailyTasks, clock.now())).toMatchObject({
      total: 1, completed: 0, incomplete: 1, missed: 1, percent: 0,
    })
    clock.set(2026, 12, 5, 12, 0)
    snap = await app.snapshot()
    expect(snap.dailyTasks[0].status).toBe('pending')
    await app.setCompleted('daily', task.id, true)
    snap = await app.snapshot()
    expect(snap.dailyTasks[0].status).toBe('completed')
    expect(isMissed('daily', snap.dailyTasks[0], clock.now())).toBe(true) // late completion still counts as missed
  })

  it('completion is only possible once execution has begun', async () => {
    const { app, clock } = setup()
    const g = await app.addMonthlyGoal(monthlyInput())
    const t = await app.addDailyTask(taskInput())
    await rejects(app.setCompleted('monthly', g.id, true), 'NOT_ALLOWED')
    await rejects(app.setCompleted('daily', t.id, true), 'NOT_ALLOWED')
    clock.set(2026, 11, 22, 6, 30)
    await app.setCompleted('daily', t.id, true)
    await app.setCompleted('monthly', g.id, true)
    const snap = await app.snapshot()
    expect(summarize('monthly', snap.monthlyGoals, clock.now()).percent).toBe(100)
    expect(summarize('daily', snap.dailyTasks, clock.now()).missed).toBe(0)
  })

  it('reflections require an incomplete, past-deadline commitment and are recorded once', async () => {
    const { app, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    const t = await app.addDailyTask(taskInput('Run', '06:00', '07:00'))
    clock.set(2026, 11, 22, 6, 30)
    await rejects(app.addReflection('daily', t.id, reflection), 'NOT_ALLOWED')
    clock.set(2026, 11, 22, 7, 1)
    await rejects(app.addReflection('daily', t.id, { ...reflection, why: '' }), 'INVALID')
    await app.addReflection('daily', t.id, reflection)
    await rejects(app.addReflection('daily', t.id, reflection), 'EXISTS')
    expect((await app.snapshot()).dailyTasks[0].title).toBe('Run')
  })
})

describe('rewards and monthly results', () => {
  it('only reports an earned reward when every goal is completed', async () => {
    const { app, clock } = setup()
    const a = await app.addMonthlyGoal(monthlyInput('A'))
    const b = await app.addMonthlyGoal(monthlyInput('B'))
    await app.addReward('Dinner out')
    clock.set(2026, 11, 23, 9, 0)
    await app.setCompleted('monthly', a.id, true)
    let snap = await app.snapshot()
    expect(rewardStatus(snap.monthlyGoals, snap.rewards)).toBe('not-earned')
    await app.setCompleted('monthly', b.id, true)
    snap = await app.snapshot()
    expect(rewardStatus(snap.monthlyGoals, snap.rewards)).toBe('earned')
    expect(goalsAllCompleted(snap.monthlyGoals)).toBe(true)
  })

  it('stores each finished cycle result and one monthly review', async () => {
    const { app, clock } = setup()
    const a = await app.addMonthlyGoal(monthlyInput('A'))
    await app.addMonthlyGoal(monthlyInput('B'))
    clock.set(2026, 12, 1, 9, 0)
    await app.setCompleted('monthly', a.id, true)
    clock.set(2026, 12, 20, 12, 0)
    await rejects(app.saveReview('2026-11-21', { whyFailed: 'x', learned: 'y', improve: 'z' }), 'NOT_ALLOWED')
    clock.set(2026, 12, 21, 9, 0)
    await app.syncCycleResults()
    let snap = await app.snapshot()
    expect(snap.reviews[0]).toMatchObject({ id: '2026-11-21', total: 2, completed: 1, rewardEarned: false })
    await rejects(app.saveReview('2026-11-21', { whyFailed: '', learned: 'y', improve: 'z' }), 'INVALID')
    await app.saveReview('2026-11-21', { whyFailed: 'Overcommitted', learned: 'Start small', improve: 'Fewer goals' })
    await rejects(app.saveReview('2026-11-21', { whyFailed: 'again', learned: 'y', improve: 'z' }), 'EXISTS')
    snap = await app.snapshot()
    expect(snap.reviews[0].reviewedAt).not.toBeNull()
    expect(app.stateFrom(snap).phase).toBe('REFLECTION DAY')
  })
})

describe('Test 14: data survives an application restart', () => {
  it('goals and completion status persist in IndexedDB across a reopen', async () => {
    const name = `intentional-test-${Math.random()}`
    const clock = new FakeClock(new Date(2026, 10, 21, 10, 0, 0))
    const first = await IndexedDbStorage.open(name)
    const app1 = new Intentional(first, clock)
    const g1 = await app1.addMonthlyGoal(monthlyInput('A'))
    await app1.addMonthlyGoal(monthlyInput('B'))
    clock.set(2026, 11, 23, 9, 0)
    await app1.setCompleted('monthly', g1.id, true)
    first.close()

    const second = await IndexedDbStorage.open(name)
    const app2 = new Intentional(second, clock)
    const snap = await app2.snapshot()
    expect(snap.monthlyGoals.map((g) => [g.title, g.status]).sort()).toEqual([
      ['A', 'completed'],
      ['B', 'pending'],
    ])
    expect(snap.anchor).toBe('2026-11-28')
  })
})
