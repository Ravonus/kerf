import { state } from '@weft-js/core'
import { Button, RadioGroup, Row, Stack, Text } from '@weft-js/warp'
import { DIGESTS } from './shared'

/** In a form, `name` is what the choice posts under: this one reads it back from the form's data. */
export function RadioGroupForm() {
  const digest = state('daily')
  const sent = state('')
  const save = (e: Event) => {
    e.preventDefault()
    sent.value = `digest=${(new FormData(e.currentTarget as HTMLFormElement).get('digest') as string | null) ?? ''}`
  }
  return (
    <Stack as="form" gap="group" onSubmit={save}>
      <Text role="heading">Failure emails</Text>
      <RadioGroup
        label="Failure emails"
        name="digest"
        value={digest.value}
        options={DIGESTS}
        onChange={(v) => (digest.value = v)}
      />
      <Row justify="between">
        <Text subtle role="caption">
          {sent.value ? `Posted ${sent.value}` : 'Nothing saved yet'}
        </Text>
        <Button type="submit">Save</Button>
      </Row>
    </Stack>
  )
}
