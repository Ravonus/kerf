import { useState, type FormEvent } from 'react'
import * as Select from '@radix-ui/react-select'
import * as Switch from '@radix-ui/react-switch'
import { Button, PageHeader, card, inputClass } from './ui'

type Profile = { name: string; email: string; role: string; bio: string; updates: boolean }

const initial: Profile = { name: 'Jordan Ellis', email: 'jordan@northwind.example', role: 'Admin', bio: 'Runs billing and onboarding for the Northwind team.', updates: true }
const roles = ['Admin', 'Editor', 'Viewer']
const labelClass = 'mb-1.5 block text-sm font-medium'

export function Settings() {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [emailError, setEmailError] = useState(false)
  const [done, setDone] = useState(false)

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDone(false)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.email.includes('@')) {
      setEmailError(true)
      setDone(false)
      return
    }
    setEmailError(false)
    setSaved(form)
    setDone(true)
  }

  const onCancel = () => {
    setForm(saved)
    setEmailError(false)
    setDone(false)
  }

  return (
    <>
      <PageHeader title="Settings">Manage your profile and how Northwind contacts you.</PageHeader>
      <form onSubmit={onSubmit} noValidate className={`${card} max-w-2xl space-y-6 p-5 sm:p-8`}>
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" className={inputClass} value={form.name} autoComplete="name" onChange={(e) => set('name', e.target.value)} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={`${inputClass} ${emailError ? 'border-red-500 dark:border-red-400' : ''}`}
            value={form.email}
            aria-invalid={emailError}
            aria-describedby={emailError ? 'email-error' : undefined}
            onChange={(e) => set('email', e.target.value)}
          />
          {emailError && (
            <p id="email-error" className="mt-1.5 text-sm text-red-700 dark:text-red-400">Enter a valid email</p>
          )}
        </div>

        <div>
          <label htmlFor="role" className={labelClass}>Role</label>
          <Select.Root value={form.role} onValueChange={(v) => set('role', v)}>
            <Select.Trigger id="role" className={`${inputClass} flex cursor-pointer items-center justify-between text-left`}>
              <Select.Value />
              <Select.Icon aria-hidden className="text-slate-500">▾</Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content position="popper" sideOffset={4} className="z-50 w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <Select.Viewport>
                  {roles.map((r) => (
                    <Select.Item key={r} value={r} className="flex min-h-9 cursor-pointer items-center justify-between rounded-md px-3 text-sm outline-none data-highlighted:bg-indigo-600 data-highlighted:text-white">
                      <Select.ItemText>{r}</Select.ItemText>
                      <Select.ItemIndicator aria-hidden>✓</Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div>
          <label htmlFor="bio" className={labelClass}>Bio</label>
          <textarea id="bio" rows={4} className={inputClass} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div>
            <label htmlFor="updates" className="block cursor-pointer text-sm font-medium">Email updates</label>
            <p className="text-sm text-slate-600 dark:text-slate-400">Product news and billing notices.</p>
          </div>
          <Switch.Root
            id="updates"
            checked={form.updates}
            onCheckedChange={(v) => set('updates', v)}
            className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-indigo-600 dark:bg-slate-700 dark:data-[state=checked]:bg-indigo-500"
          >
            <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5.5" />
          </Switch.Root>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit">Save</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{done ? 'Saved' : ''}</p>
        </div>
      </form>
    </>
  )
}
