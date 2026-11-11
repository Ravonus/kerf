import { Accordion, Stack } from '@kerf/veneer'
import { QUESTIONS } from './shared'

export const AccordionPlay = ({
  variant,
  multiple,
}: {
  variant: 'boxed' | 'line'
  multiple: boolean
}) => (
  <Stack>
    <Accordion
      variant={variant}
      multiple={multiple}
      defaultOpen={['rollback']}
      items={QUESTIONS}
    />
  </Stack>
)
