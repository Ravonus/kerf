import type { State } from '@kerf/core'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { Select } from '../Select'

type KeyForm = {
  name: State<string>
  nameError: State<string>
  chosen: State<string[]>
  scopeError: State<string>
  readonly scopes: { value: string; label: string }[]
  expires: State<string>
  readonly expiries: { value: string; label: string }[]
  toggle: (value: string, on: boolean) => void
  make: () => Promise<void>
  setForm: (node: HTMLElement) => void
}

export function keyForm(input: KeyForm) {
  const { name, nameError, chosen, scopeError, expires, toggle, make, setForm } = input
  return (
    <form
      ref={(n) => setForm(n)}
      data-scope="stack"
      style="padding-block-start:var(--veneer-space-related)"
      novalidate
      onSubmit={(e: Event) => {
        e.preventDefault()
        void make()
      }}
    >
      <Input
        label="Key name"
        placeholder="e.g. CI deploys"
        autofocus
        value={name.value}
        error={nameError.value}
        onInput={(e) => {
          name.value = e.currentTarget.value
          nameError.value = ''
        }}
      />
      <fieldset data-scope="choice">
        <legend>Scopes</legend>
        {input.scopes.map((s) => (
          <Checkbox
            key={s.value}
            checked={chosen.value.includes(s.value)}
            error={s === input.scopes[0] && scopeError.value ? scopeError.value : undefined}
            onChange={(e: Event) => toggle(s.value, (e.currentTarget as HTMLInputElement).checked)}
          >
            {s.label}
          </Checkbox>
        ))}
      </fieldset>
      <Select
        label="Expires"
        options={input.expiries}
        value={expires.value}
        onChange={(e: Event) => (expires.value = (e.currentTarget as HTMLInputElement).value)}
      />
    </form>
  )
}
