import { useState } from 'react'
import { Button, Field, RoleSelect, Toggle, inputCls } from './ui'

const initial = {
  name: 'Jordan Rivera',
  email: 'jordan@northwind.example',
  role: 'Admin',
  bio: 'Runs operations and billing for the Northwind workspace.',
  updates: true,
}

export function Settings() {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDone(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.includes('@')) {
      setError('Enter a valid email')
      setDone(false)
      return
    }
    setError('')
    setSaved(form)
    setDone(true)
  }

  function cancel() {
    setForm(saved)
    setError('')
    setDone(false)
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Manage your profile and notification preferences.
      </p>
      <form
        onSubmit={submit}
        noValidate
        className="mt-8 max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name">
            <input
              id="name"
              className={inputCls}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email" error={error}>
            <input
              id="email"
              type="text"
              inputMode="email"
              className={`${inputCls} ${error ? 'border-red-500 dark:border-red-500' : ''}`}
              value={form.email}
              aria-invalid={!!error}
              aria-describedby={error ? 'email-error' : undefined}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Role" htmlFor="role">
          <RoleSelect
            id="role"
            value={form.role}
            onValueChange={(v) => set('role', v)}
            options={['Admin', 'Editor', 'Viewer']}
          />
        </Field>
        <Field label="Bio" htmlFor="bio">
          <textarea
            id="bio"
            rows={4}
            className={inputCls}
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-950">
          <div>
            <label htmlFor="updates" className="text-sm font-medium">
              Email updates
            </label>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Product news and billing notices.
            </p>
          </div>
          <Toggle id="updates" checked={form.updates} onCheckedChange={(v) => set('updates', v)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Save</Button>
          <Button type="button" variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {done ? 'Saved' : ''}
          </p>
        </div>
      </form>
    </>
  )
}
