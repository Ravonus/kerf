import { derived, state } from '@kerf/core'
import {
  Card,
  Input,
  NumberField,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from '@kerf/veneer'

type Size = 'small' | 'large'

export default function Order() {
  const name = state('')
  const note = state('')
  const cups = state<number | null>(1)
  const size = state<Size>('small')
  const milk = state<string | null>('oat')
  const iced = state(false)
  const customer = derived(() => name.value || 'Someone')
  return (
    <Card title="One of each">
      <Input
        label="Name"
        value={name.value}
        onInput={(e) =>
          (name.value = e.currentTarget.value)
        }
      />
      <Textarea
        label="Note"
        value={note.value}
        onInput={(e) =>
          (note.value = e.currentTarget.value)
        }
      />
      {/* NumberField and Select take the box itself
          and write it. */}
      <NumberField
        label="Cups"
        min={1}
        max={9}
        value={cups}
      />
      <Select
        label="Milk"
        value={milk}
        options={[
          { value: 'oat', label: 'Oat' },
          { value: 'whole', label: 'Whole' },
          { value: 'none', label: 'None' },
        ]}
      />
      <RadioGroup
        label="Size"
        value={size.value}
        onChange={(v) => (size.value = v)}
        options={[
          { value: 'small', label: 'Small' },
          { value: 'large', label: 'Large' },
        ]}
      />
      <Switch
        checked={iced.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (iced.value = e.currentTarget.checked)}
      >
        Iced
      </Switch>
      <p>
        {customer.value} wants {cups.value ?? 0}{' '}
        {size.value} {iced.value ? 'iced ' : ''}
        {milk.value === 'none'
          ? 'black'
          : `${milk.value ?? ''} milk`}{' '}
        coffee
        {note.value ? `: “${note.value}”` : '.'}
      </p>
    </Card>
  )
}
