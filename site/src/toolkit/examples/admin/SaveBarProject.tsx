import { state } from '@weft-js/core'
import { Input, SaveBar, Stack, Toaster } from '@weft-js/warp'
import { wait } from './shared'

export function SaveBarProject() {
  const values = state({ name: 'storefront', branch: 'main' })
  const errors = state<Record<string, string>>({})
  const set = (key: 'name' | 'branch', value: string) =>
    (values.value = { ...values.value, [key]: value })
  return (
    <Stack as="form" gap="group">
      <Input
        label="Project name"
        value={values.value.name}
        error={errors.value.name ?? ''}
        onInput={(e) => set('name', e.currentTarget.value)}
      />
      <Input
        label="Production branch"
        value={values.value.branch}
        hint="Change a field and the bar rises."
        error={errors.value.branch ?? ''}
        onInput={(e) => set('branch', e.currentTarget.value)}
      />
      <SaveBar
        values={values}
        errors={errors}
        validate={(v) => (v.name.trim() ? {} : { name: 'A project needs a name.' })}
        onSave={() => wait(800)}
      />
      <Toaster />
    </Stack>
  )
}
