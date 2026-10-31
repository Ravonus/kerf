import * as Select from '@radix-ui/react-select'
import * as Switch from '@radix-ui/react-switch'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

export const inputCls = `block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${focus}`

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant]
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors ${focus} ${styles} ${className}`}
      {...props}
    />
  )
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function RoleSelect({
  id,
  value,
  onValueChange,
  options,
}: {
  id: string
  value: string
  onValueChange: (v: string) => void
  options: string[]
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger id={id} className={`${inputCls} flex items-center justify-between text-left`}>
        <Select.Value />
        <Select.Icon aria-hidden className="text-slate-500">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o}
                value={o}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-brand-50 data-highlighted:text-brand-700 dark:data-highlighted:bg-slate-800 dark:data-highlighted:text-brand-100"
              >
                <Select.ItemText>{o}</Select.ItemText>
                <Select.ItemIndicator>✓</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Toggle({
  id,
  checked,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600 dark:bg-slate-700 dark:data-[state=checked]:bg-brand-500 ${focus}`}
    >
      <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </Switch.Root>
  )
}
