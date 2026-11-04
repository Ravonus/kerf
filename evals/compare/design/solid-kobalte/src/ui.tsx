import { TextField, Select, Switch } from '@kobalte/core'
import { Show } from 'solid-js'

export function Field(props: {
  label: string
  value: string
  onInput: (v: string) => void
  type?: string
  multiline?: boolean
  error?: string
  placeholder?: string
}) {
  return (
    <TextField.Root
      value={props.value}
      onChange={props.onInput}
      validationState={props.error ? 'invalid' : 'valid'}
    >
      <TextField.Label class="field-label">{props.label}</TextField.Label>
      <Show
        when={props.multiline}
        fallback={
          <TextField.Input
            class="input"
            type={props.type ?? 'text'}
            placeholder={props.placeholder}
          />
        }
      >
        <TextField.TextArea
          class="input"
          rows={4}
          autoResize={false}
          placeholder={props.placeholder}
        />
      </Show>
      <TextField.ErrorMessage class="error-text">{props.error}</TextField.ErrorMessage>
    </TextField.Root>
  )
}

export function Dropdown(props: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Select.Root
      options={props.options}
      value={props.value}
      onChange={(v) => v && props.onChange(v)}
      disallowEmptySelection
      itemComponent={(p) => (
        <Select.Item
          item={p.item}
          class="flex cursor-default items-center justify-between rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-900 dark:data-[highlighted]:bg-slate-800 dark:data-[highlighted]:text-white"
        >
          <Select.ItemLabel>{p.item.rawValue}</Select.ItemLabel>
          <Select.ItemIndicator class="text-indigo-600 dark:text-indigo-400">
            ✓
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Label class="field-label">{props.label}</Select.Label>
      <Select.HiddenSelect />
      <Select.Trigger class="input flex items-center justify-between text-left">
        <Select.Value<string>>{(s) => s.selectedOption()}</Select.Value>
        <Select.Icon class="text-slate-500" aria-hidden="true">
          ▾
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="z-50 min-w-[var(--kb-popper-anchor-width)] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <Select.Listbox class="outline-none" />
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch.Root
      checked={props.checked}
      onChange={props.onChange}
      class="flex items-center justify-between gap-4"
    >
      <Switch.Label class="text-sm font-medium text-slate-700 dark:text-slate-300">
        {props.label}
      </Switch.Label>
      <Switch.Input />
      <Switch.Control class="inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300 p-0.5 transition-colors data-[checked]:bg-indigo-600 dark:bg-slate-700 dark:data-[checked]:bg-indigo-500 [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-indigo-600">
        <Switch.Thumb class="size-5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-5" />
      </Switch.Control>
    </Switch.Root>
  )
}
