import { createSignal, Show } from 'solid-js'
import { Field, Dropdown, Toggle } from '../ui'

const initial = {
  name: 'Avery Collins',
  email: 'avery@northwind.example',
  role: 'Admin',
  bio: 'Runs operations at Northwind.',
  updates: true,
}

export default function Settings() {
  const [saved, setSaved] = createSignal({ ...initial })
  const [name, setName] = createSignal(initial.name)
  const [email, setEmail] = createSignal(initial.email)
  const [role, setRole] = createSignal(initial.role)
  const [bio, setBio] = createSignal(initial.bio)
  const [updates, setUpdates] = createSignal(initial.updates)
  const [error, setError] = createSignal('')
  const [ok, setOk] = createSignal(false)

  const save = (e: SubmitEvent) => {
    e.preventDefault()
    setOk(false)
    if (!email().includes('@')) return setError('Enter a valid email')
    setError('')
    setSaved({ name: name(), email: email(), role: role(), bio: bio(), updates: updates() })
    setOk(true)
  }
  const cancel = () => {
    const s = saved()
    setName(s.name)
    setEmail(s.email)
    setRole(s.role)
    setBio(s.bio)
    setUpdates(s.updates)
    setError('')
    setOk(false)
  }

  return (
    <>
      <header class="mb-8">
        <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-400">
          Manage your profile and how Northwind keeps in touch.
        </p>
      </header>
      <form onSubmit={save} novalidate class="card max-w-2xl space-y-6 p-5 sm:p-8">
        <div class="grid gap-6 sm:grid-cols-2">
          <Field
            label="Full name"
            value={name()}
            onInput={(v) => {
              setName(v)
              setOk(false)
            }}
          />
          <Field
            label="Email"
            type="email"
            value={email()}
            onInput={(v) => {
              setEmail(v)
              setOk(false)
            }}
            error={error()}
          />
        </div>
        <Dropdown
          label="Role"
          options={['Admin', 'Editor', 'Viewer']}
          value={role()}
          onChange={(v) => {
            setRole(v)
            setOk(false)
          }}
        />
        <Field
          label="Bio"
          multiline
          value={bio()}
          onInput={(v) => {
            setBio(v)
            setOk(false)
          }}
        />
        <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <Toggle
            label="Email updates"
            checked={updates()}
            onChange={(v) => {
              setUpdates(v)
              setOk(false)
            }}
          />
        </div>
        <div class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
          <button type="submit" class="btn btn-primary">
            Save
          </button>
          <button type="button" class="btn btn-secondary" onClick={cancel}>
            Cancel
          </button>
          <p role="status" class="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Show when={ok()}>Saved</Show>
          </p>
        </div>
      </form>
    </>
  )
}
