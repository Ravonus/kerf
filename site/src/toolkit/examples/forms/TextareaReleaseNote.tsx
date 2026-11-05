import { state } from '@weft-js/core'
import { Button, Row, Stack, Text, Textarea } from '@weft-js/warp'

export function TextareaReleaseNote() {
  const text = state('')
  const notes = state(['Lowered the stale window to 30s.'])
  const post = (e: Event) => {
    e.preventDefault()
    if (!text.value.trim()) return
    notes.value = [text.value.trim(), ...notes.value]
    text.value = ''
  }
  return (
    <Stack as="form" gap="group" onSubmit={post}>
      <Textarea
        label="Release note"
        counter={140}
        hint="⌘ Enter posts it."
        value={text.value}
        onInput={(e) => (text.value = e.currentTarget.value)}
      />
      <Row justify="end">
        <Button type="submit" aria-disabled={text.value.trim() ? undefined : 'true'}>
          Post note
        </Button>
      </Row>
      <Stack gap="tight">
        {notes.value.map((n) => (
          <Text key={n} subtle>
            {n}
          </Text>
        ))}
      </Stack>
    </Stack>
  )
}
