'use client'

import { Capacitor } from '@capacitor/core'
import { Download, FileText, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useIntentional } from '@/lib/intentional/app-context'
import {
  BackupError,
  createBackup,
  exportHistoryText,
  isEncryptedBackup,
  restoreBackup,
} from '@/lib/intentional/backup'
import {
  notificationPermissionGranted,
  notificationsSupported,
  requestNotificationPermission,
} from '@/lib/intentional/notifications'
import type { NotificationPrefs } from '@/lib/intentional/types'
import { GhostButton, SectionTitle, Sheet, TextInput } from './ui'

async function saveFile(name: string, content: string, mime: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: name,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return `Saved to Documents/${name}`
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return `Downloaded ${name}`
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-[#d6f5b5]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

export function SettingsSheet() {
  const { app, snap, now, settingsOpen, setSettingsOpen, act, reload, storageKind } = useIntentional()
  const [password, setPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const prefs = snap.notificationPrefs

  const setPref = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) =>
    act(() => app.setNotificationPrefs({ ...prefs, [k]: v }))

  const enableNotifications = async (on: boolean) => {
    if (on && notificationsSupported() && !(await notificationPermissionGranted())) {
      const ok = await requestNotificationPermission()
      if (!ok) {
        setMessage('Notification permission was denied. Enable it in Android settings.')
        return
      }
    }
    await setPref('enabled', on)
  }

  const exportBackup = async () => {
    await act(async () => {
      const text = await createBackup(app.storage, new Date(), password || undefined)
      await app.markBackup()
      setMessage(
        await saveFile(`intentional-backup-${now.toISOString().slice(0, 10)}.json`, text, 'application/json'),
      )
    })
  }

  const exportHistory = async () => {
    const text = exportHistoryText(snap, new Date())
    setMessage(
      await saveFile(`intentional-history-${now.toISOString().slice(0, 10)}.txt`, text, 'text/plain'),
    )
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setPendingFile({ name: file.name, text: await file.text() })
    setMessage('')
  }

  const doRestore = async () => {
    if (!pendingFile) return
    if (!window.confirm('Restoring replaces ALL data on this device with the backup. Continue?')) return
    try {
      const counts = await restoreBackup(app.storage, pendingFile.text, restorePassword || undefined)
      setMessage(`Restored ${Object.values(counts).reduce((a, b) => a + b, 0)} records.`)
      setPendingFile(null)
      setRestorePassword('')
      await reload()
    } catch (e) {
      setMessage(e instanceof BackupError ? e.message : 'Restore failed.')
    }
  }

  return (
    <Sheet
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      title="Settings"
      description="Everything stays on this device. Nothing is sent anywhere."
    >
      <div className="space-y-6">
        <section>
          <SectionTitle>Reminders</SectionTitle>
          {!notificationsSupported() ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Reminders are delivered by the Android app. In a browser they are not scheduled.
            </p>
          ) : null}
          <Toggle label="Enable reminders" checked={prefs.enabled} onChange={enableNotifications} />
          <Toggle label="Monthly planning (21st)" checked={prefs.monthly} disabled={!prefs.enabled} onChange={(v) => setPref('monthly', v)} />
          <Toggle label="Weekly planning" checked={prefs.weekly} disabled={!prefs.enabled} onChange={(v) => setPref('weekly', v)} />
          <Toggle label="Daily planning" checked={prefs.daily} disabled={!prefs.enabled} onChange={(v) => setPref('daily', v)} />
          <Toggle label="Window closing soon" checked={prefs.closing} disabled={!prefs.enabled} onChange={(v) => setPref('closing', v)} />
          <Toggle label="Task deadlines" checked={prefs.deadlines} disabled={!prefs.enabled} onChange={(v) => setPref('deadlines', v)} />
        </section>

        <section className="space-y-3">
          <SectionTitle>Backup</SectionTitle>
          <TextInput
            label="Password (optional)"
            hint="If set, the backup file is encrypted with AES-256. There is no way to recover a lost password."
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <GhostButton className="w-full" onClick={exportBackup}>
            <Download className="size-4" aria-hidden />
            Export backup
          </GhostButton>
          <GhostButton className="w-full" onClick={exportHistory}>
            <FileText className="size-4" aria-hidden />
            Export readable history
          </GhostButton>
          <p className="text-xs text-muted-foreground">
            {snap.lastBackupAt ? `Last backup: ${new Date(snap.lastBackupAt).toLocaleString()}` : 'No backup made yet.'}
          </p>
        </section>

        <section className="space-y-3">
          <SectionTitle>Restore</SectionTitle>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose backup file"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <GhostButton className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            {pendingFile ? pendingFile.name : 'Choose backup file'}
          </GhostButton>
          {pendingFile ? (
            <>
              {isEncryptedBackup(pendingFile.text) ? (
                <TextInput
                  label="Backup password"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                />
              ) : null}
              <GhostButton className="w-full border-destructive/40 text-destructive" onClick={doRestore}>
                Replace all data with this backup
              </GhostButton>
            </>
          ) : null}
        </section>

        {message ? (
          <p role="status" className="text-sm text-primary">
            {message}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">Storage: {storageKind}</p>
      </div>
    </Sheet>
  )
}
