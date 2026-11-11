import { state } from '@kerf-js/core'
import { Accordion, Stack, Text } from '@kerf-js/veneer'
import { QUESTIONS } from './shared'

export function AccordionHeardChange() {
  const open = state(['rollback'])
  return (
    <Stack gap="group">
      <Accordion
        multiple
        defaultOpen={['rollback']}
        onChange={(list) => (open.value = list)}
        items={QUESTIONS}
      />
      <Text subtle>
        {open.value.length} of {QUESTIONS.length} open
      </Text>
    </Stack>
  )
}
