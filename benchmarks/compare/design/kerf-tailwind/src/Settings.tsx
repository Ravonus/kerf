import { state } from '@kerf-js/core'
import { Button, Card, Field, PageHeader, control } from './ui'

const initial = {
  name: 'Avery Morgan',
  email: 'avery@northwind.example',
  role: 'Admin',
  bio: 'Runs operations and billing for the Northwind workspace.',
}

function useSettings() {
  const name = state(initial.name)
  const email = state(initial.email)
  const role = state(initial.role)
  const bio = state(initial.bio)
  const updates = state(true)
  const error = state<string | false>(false)
  const saved = state(false)

  const save = (e: Event) => {
    e.preventDefault()
    saved.value = false
    if (!email.value.includes('@')) {
      error.value = 'Enter a valid email'
      return
    }
    error.value = false
    saved.value = true
  }
  const cancel = () => {
    name.value = initial.name
    email.value = initial.email
    role.value = initial.role
    bio.value = initial.bio
    updates.value = true
    error.value = false
    saved.value = false
  }

  return { name, email, role, bio, updates, error, saved, save, cancel }
}

function updatesSwitch(updates: ReturnType<typeof useSettings>['updates']) {
  return (
    <div class="flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <span id="email-updates" class="text-sm font-medium text-slate-700 dark:text-slate-200">
        Email updates
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={updates.value ? 'true' : 'false'}
        aria-labelledby="email-updates"
        onClick={() => {
          updates.value = !updates.value
        }}
        class={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${updates.value ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span
          class={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition ${updates.value ? 'translate-x-5' : ''}`}
        />
      </button>
    </div>
  )
}

export function Settings() {
  const { name, email, role, bio, updates, error, saved, save, cancel } = useSettings()

  return (
    <section>
      <PageHeader title="Settings" blurb="Manage your profile and how Northwind keeps in touch." />
      <Card class="max-w-2xl">
        <form onSubmit={save} noValidate class="flex flex-col gap-5">
          <Field label="Full name">
            <input
              class={control}
              aria-label="Full name"
              value={name.value}
              onInput={(e: Event) => {
                name.value = (e.target as HTMLInputElement).value
              }}
            />
          </Field>
          <Field label="Email" error={error.value}>
            <input
              class={control}
              aria-label="Email"
              type="email"
              aria-invalid={error.value ? 'true' : 'false'}
              value={email.value}
              onInput={(e: Event) => {
                email.value = (e.target as HTMLInputElement).value
              }}
            />
          </Field>
          <Field label="Role">
            <select
              class={control}
              aria-label="Role"
              value={role.value}
              onChange={(e: Event) => {
                role.value = (e.target as HTMLSelectElement).value
              }}
            >
              <option>Admin</option>
              <option>Editor</option>
              <option>Viewer</option>
            </select>
          </Field>
          <Field label="Bio">
            <textarea
              class={control}
              aria-label="Bio"
              rows={4}
              value={bio.value}
              onInput={(e: Event) => {
                bio.value = (e.target as HTMLTextAreaElement).value
              }}
            />
          </Field>
          {updatesSwitch(updates)}
          <div class="flex flex-wrap items-center gap-3">
            <Button type="submit" tone="primary">
              Save
            </Button>
            <Button onClick={cancel}>Cancel</Button>
            {saved.value && (
              <span
                role="status"
                class="text-sm font-medium text-emerald-700 dark:text-emerald-400"
              >
                Saved
              </span>
            )}
          </div>
        </form>
      </Card>
    </section>
  )
}
