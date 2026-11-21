import { formatDate } from './dates'
import { rewardStatus } from './stats'
import { emptyData, STORE_NAMES, type AllData, type Storage } from './storage'
import type { Snapshot } from './types'

const FORMAT = 'intentional-backup'
const VERSION = 1
const PBKDF2_ITERATIONS = 250_000

interface BackupPayload {
  app: 'intentional'
  version: number
  exportedAt: string
  data: AllData
}

interface EncryptedEnvelope {
  format: typeof FORMAT
  version: number
  encrypted: true
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

interface PlainEnvelope {
  format: typeof FORMAT
  version: number
  encrypted: false
  payload: BackupPayload
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export class BackupError extends Error {}

/** Builds a backup file's text. With a password it is AES-256-GCM encrypted. */
export async function createBackup(
  storage: Storage,
  now: Date,
  password?: string,
): Promise<string> {
  const payload: BackupPayload = {
    app: 'intentional',
    version: VERSION,
    exportedAt: now.toISOString(),
    data: await storage.exportAll(),
  }
  if (!password) {
    const env: PlainEnvelope = { format: FORMAT, version: VERSION, encrypted: false, payload }
    return JSON.stringify(env)
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const env: EncryptedEnvelope = {
    format: FORMAT,
    version: VERSION,
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
  }
  return JSON.stringify(env)
}

export function isEncryptedBackup(fileText: string): boolean {
  try {
    const env = JSON.parse(fileText)
    return env?.format === FORMAT && env.encrypted === true
  } catch {
    return false
  }
}

function validatePayload(p: unknown): BackupPayload {
  const payload = p as BackupPayload
  if (!payload || payload.app !== 'intentional' || typeof payload.data !== 'object') {
    throw new BackupError('This is not an Intentional backup.')
  }
  if (payload.version > VERSION) {
    throw new BackupError('This backup was made by a newer version of Intentional.')
  }
  const data = emptyData()
  for (const name of STORE_NAMES) {
    const rows = payload.data[name]
    if (rows === undefined) continue
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string')) {
      throw new BackupError(`The backup is damaged (${name}).`)
    }
    data[name] = rows
  }
  return { ...payload, data }
}

/** Replaces all local data with the backup's. Nothing is changed if validation fails. */
export async function restoreBackup(
  storage: Storage,
  fileText: string,
  password?: string,
): Promise<Record<string, number>> {
  let env: PlainEnvelope | EncryptedEnvelope
  try {
    env = JSON.parse(fileText)
  } catch {
    throw new BackupError('That file is not a valid backup.')
  }
  if (env?.format !== FORMAT) throw new BackupError('That file is not an Intentional backup.')

  let payload: unknown
  if (env.encrypted) {
    if (!password) throw new BackupError('This backup is encrypted. Enter its password.')
    try {
      const key = await deriveKey(password, fromBase64(env.salt), env.iterations)
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(env.iv) },
        key,
        fromBase64(env.ciphertext),
      )
      payload = JSON.parse(new TextDecoder().decode(plain))
    } catch {
      throw new BackupError('Wrong password, or the backup file is damaged.')
    }
  } else {
    payload = env.payload
  }
  const valid = validatePayload(payload)
  await storage.replaceAll(valid.data)
  return Object.fromEntries(STORE_NAMES.map((n) => [n, valid.data[n].length]))
}

/** Human-readable export of every commitment, result and reflection. */
export function exportHistoryText(snap: Snapshot, now: Date): string {
  const lines: string[] = []
  const done = (s: string) => (s === 'completed' ? '[x]' : '[ ]')
  lines.push('INTENTIONAL — History export', `Exported: ${now.toLocaleString()}`, '')
  const cycles = [...new Set(snap.monthlyGoals.map((g) => g.cycleId))].sort().reverse()
  for (const cycleId of cycles) {
    const goals = snap.monthlyGoals.filter((g) => g.cycleId === cycleId)
    const rewards = snap.rewards.filter((r) => r.cycleId === cycleId)
    const review = snap.reviews.find((r) => r.id === cycleId)
    lines.push(`=== Monthly cycle planned ${cycleId} ===`)
    for (const g of goals) {
      lines.push(
        `${done(g.status)} ${g.title} (deadline ${g.deadline})`,
        `    Why: ${g.reason}`,
        `    Important because: ${g.importance}`,
        `    Plan: ${g.actionPlan}`,
        `    Obstacles: ${g.obstacles}`,
        `    Prevention: ${g.prevention}`,
      )
      const r = snap.reflections.find((x) => x.id === `monthly:${g.id}`)
      if (r) lines.push(...reflectionLines(r))
    }
    lines.push(
      `Rewards: ${rewards.map((r) => r.text).join('; ') || '—'}`,
      `Reward result: ${rewardStatus(goals, rewards)}`,
    )
    if (review?.reviewedAt) {
      lines.push(
        `Review — failed because: ${review.whyFailed || '—'}`,
        `Review — learned: ${review.learned}`,
        `Review — improve: ${review.improve}`,
      )
    }
    lines.push('')
  }
  lines.push('=== Weekly goals ===')
  for (const g of [...snap.weeklyGoals].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))) {
    lines.push(
      `${done(g.status)} ${g.title} (week ${g.periodStart} to ${g.periodEnd})`,
      `    Why: ${g.reason}`,
      `    Plan: ${g.actionPlan}`,
    )
    const r = snap.reflections.find((x) => x.id === `weekly:${g.id}`)
    if (r) lines.push(...reflectionLines(r))
  }
  lines.push('', '=== Daily tasks ===')
  for (const t of [...snap.dailyTasks].sort((a, b) => b.date.localeCompare(a.date))) {
    lines.push(
      `${done(t.status)} ${formatDate(t.date)} ${t.start}-${t.end} ${t.title}`,
    )
    const r = snap.reflections.find((x) => x.id === `daily:${t.id}`)
    if (r) lines.push(...reflectionLines(r))
  }
  return lines.join('\n')
}

function reflectionLines(r: Snapshot['reflections'][number]): string[] {
  return [
    '    Reflection:',
    `      Why not achieved: ${r.why}`,
    `      What prevented it: ${r.prevented}`,
    `      Avoidable: ${r.avoidable}`,
    `      Do differently: ${r.different}`,
    `      Change next time: ${r.change}`,
  ]
}
