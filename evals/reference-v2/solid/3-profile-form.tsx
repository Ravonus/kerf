import { createComputed, createSignal, on, Show } from 'solid-js'

type User = { id: string; name: string; email: string }
type Values = { name: string; email: string }
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function ProfileForm(props: { user: User; onSave: (v: Values) => void }) {
  const [base, setBase] = createSignal<Values>({ name: '', email: '' })
  const [values, setValues] = createSignal<Values>({ name: '', email: '' })
  const dirty = () => values().name !== base().name || values().email !== base().email

  createComputed(
    on(
      () => [props.user.id, props.user.name, props.user.email] as const,
      ([id, name, email], prev) => {
        const next = { name, email }
        const wasDirty = prev !== undefined && dirty()
        setBase(next)
        if (!prev || prev[0] !== id || !wasDirty) setValues(next)
      },
    ),
  )

  const valid = () => EMAIL.test(values().email.trim())
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const out = { name: values().name.trim(), email: values().email.trim() }
        props.onSave(out)
        setBase(out)
        setValues(out)
      }}
    >
      <label>
        Name{' '}
        <input
          value={values().name}
          onInput={(e) => setValues((v) => ({ ...v, name: e.currentTarget.value }))}
        />
      </label>
      <label>
        Email{' '}
        <input
          value={values().email}
          onInput={(e) => setValues((v) => ({ ...v, email: e.currentTarget.value }))}
        />
      </label>
      <Show when={dirty()}>
        <p data-testid="dirty">Unsaved changes</p>
      </Show>
      <button type="submit" disabled={!dirty() || !valid()}>
        Save
      </button>
    </form>
  )
}
