import { describe, expect, it } from 'vitest'
import { BackupError, createBackup, isEncryptedBackup, restoreBackup } from '../lib/intentional/backup'
import { buildNotificationPlan } from '../lib/intentional/notifications'
import { DEFAULT_NOTIFICATION_PREFS } from '../lib/intentional/types'
import { MemoryStorage } from '../lib/intentional/storage'
import { monthlyInput, setup, taskInput } from './helpers'

describe('backup and restore', () => {
  it('round-trips an encrypted backup and rejects a wrong password', async () => {
    const { app, storage, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    await app.addDailyTask(taskInput())
    await app.addReward('Trip')
    const file = await createBackup(storage, clock.now(), 'correct horse')
    expect(isEncryptedBackup(file)).toBe(true)
    expect(file).not.toContain('Read two books')

    const target = new MemoryStorage()
    await expect(restoreBackup(target, file, 'wrong')).rejects.toBeInstanceOf(BackupError)
    expect((await target.exportAll()).monthlyGoals).toHaveLength(0)
    const counts = await restoreBackup(target, file, 'correct horse')
    expect(counts.monthlyGoals).toBe(1)
    expect(counts.dailyTasks).toBe(1)
    expect((await target.exportAll()).rewards[0]).toMatchObject({ text: 'Trip' })
  })

  it('supports plain backups and rejects foreign files', async () => {
    const { app, storage, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    const file = await createBackup(storage, clock.now())
    const target = new MemoryStorage()
    await restoreBackup(target, file)
    expect((await target.exportAll()).monthlyGoals).toHaveLength(1)
    await expect(restoreBackup(target, '{"hello":1}')).rejects.toBeInstanceOf(BackupError)
    await expect(restoreBackup(target, 'nope')).rejects.toBeInstanceOf(BackupError)
  })
})

describe('notification plan', () => {
  const prefs = DEFAULT_NOTIFICATION_PREFS
  it('uses monthly reminders on the 21st instead of the daily reminder', () => {
    const now = new Date(2026, 10, 20, 12, 0)
    const plan = buildNotificationPlan(now, '2026-11-28', [], prefs)
    const keys = plan.map((p) => p.key)
    expect(keys).toContain('monthly-evening:2026-11-21')
    expect(keys).toContain('monthly-closing:2026-11-21')
    expect(keys).not.toContain('daily:2026-11-21')
    expect(keys).not.toContain('closing:2026-11-21')
    expect(keys).toContain('daily:2026-11-22')
    expect(keys).toContain('weekly:2026-11-28')
    expect(keys).not.toContain('daily:2026-11-28')
  })

  it('adds deadline reminders for pending tasks only and respects disabled notifications', async () => {
    const { app, clock } = setup()
    await app.addMonthlyGoal(monthlyInput())
    const task = await app.addDailyTask(taskInput('Run', '06:00', '07:00'))
    const snap = await app.snapshot()
    const plan = buildNotificationPlan(clock.now(), snap.anchor, snap.dailyTasks, prefs)
    const due = plan.find((p) => p.key === `deadline:${task.id}`)
    expect(due?.at).toEqual(new Date(2026, 10, 22, 6, 50))
    expect(buildNotificationPlan(clock.now(), snap.anchor, snap.dailyTasks, { ...prefs, enabled: false })).toEqual([])
    const done = snap.dailyTasks.map((t) => ({ ...t, status: 'completed' as const }))
    expect(buildNotificationPlan(clock.now(), snap.anchor, done, prefs).some((p) => p.key.startsWith('deadline:'))).toBe(false)
  })
})
