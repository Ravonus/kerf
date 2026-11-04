import { useEffect, useState } from 'react'

type User = { id: string; name: string; email: string }
type Values = { name: string; email: string }
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function ProfileForm({ user, onSave }: { user: User; onSave: (v: Values) => void }) {
  const [seen, setSeen] = useState(user)
  const [base, setBase] = useState<Values>({ name: user.name, email: user.email })
  const [values, setValues] = useState<Values>(base)
  const dirty = values.name !== base.name || values.email !== base.email

  useEffect(() => {
    const next = { name: user.name, email: user.email }
    setBase(next)
    setValues(next)
  }, [user])

  const valid = EMAIL.test(values.email.trim())
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const out = { name: values.name.trim(), email: values.email.trim() }
    onSave(out)
    setBase(out)
    setValues(out)
  }
  return (
    <form onSubmit={save}>
      <label>
        Name{' '}
        <input
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </label>
      <label>
        Email{' '}
        <input
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </label>
      {dirty && <p data-testid="dirty">Unsaved changes</p>}
      <button type="submit" disabled={!dirty || !valid}>
        Save
      </button>
    </form>
  )
}
