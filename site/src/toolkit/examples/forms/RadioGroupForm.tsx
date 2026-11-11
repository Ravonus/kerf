import { state } from '@kerf-js/core'
import {
  Button,
  RadioGroup,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { DIGESTS } from './shared'

/** In a form, `name` is what the choice posts under.
 * This reads it back from the form's data. */
export function RadioGroupForm() {
  const digest = state('daily')
  const sent = state('')
  const save = (e: Event) => {
    e.preventDefault()
    const form = new FormData(
      e.currentTarget as HTMLFormElement,
    )
    const value = form.get('digest') as string | null
    sent.value = `digest=${value ?? ''}`
  }
  return (
    <Stack
      as="form"
      gap="group"
      onSubmit={save}
    >
      <Text role="heading">Failure emails</Text>
      <RadioGroup
        label="Failure emails"
        name="digest"
        value={digest.value}
        options={DIGESTS}
        onChange={(v) => (digest.value = v)}
      />
      <Row justify="between">
        <Text
          subtle
          role="caption"
        >
          {sent.value
            ? `Posted ${sent.value}`
            : 'Nothing saved yet'}
        </Text>
        <Button type="submit">Save</Button>
      </Row>
    </Stack>
  )
}
