'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Lock, Unlock, X } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-2xl border border-border bg-card p-4', className)}
      {...props}
    />
  )
}

export function SectionTitle({
  children,
  right,
  className,
}: {
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </h2>
      {right}
    </div>
  )
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </header>
  )
}

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number
  label: string
  className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'warn' | 'danger'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  accent: 'bg-primary/15 text-primary',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-destructive/15 text-destructive',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function LockNotice({
  open,
  children,
  className,
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  const Icon = open ? Unlock : Lock
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm',
        open
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-secondary/60 text-muted-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-pretty">{children}</p>
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

const fieldBase =
  'w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50'

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  )
}

export function TextInput({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'className'> & {
  label: string
  hint?: string
  className?: string
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className={cn(fieldBase, className)} {...props} />
    </Field>
  )
}

export function TextArea({
  label,
  hint,
  rows = 3,
  ...props
}: Omit<ComponentProps<'textarea'>, 'className'> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea id={id} rows={rows} className={cn(fieldBase, 'resize-none')} {...props} />
    </Field>
  )
}

export function SelectInput({
  label,
  hint,
  children,
  ...props
}: Omit<ComponentProps<'select'>, 'className'> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className={cn(fieldBase, 'appearance-none')} {...props}>
        {children}
      </select>
    </Field>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-xl border border-border bg-card p-1"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 flex-1 rounded-lg px-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl border border-border bg-background pb-[env(safe-area-inset-bottom)] outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-6 pt-2">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function PrimaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}

export function GhostButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/60 px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
}
