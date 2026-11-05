import { Accordion, Stack } from '@weft-js/warp'
import { QUESTIONS } from './shared'

export const AccordionPlay = (p: { variant: 'boxed' | 'line'; multiple: boolean }) => (
  <Stack>
    <Accordion
      variant={p.variant}
      multiple={p.multiple}
      defaultOpen={['rollback']}
      items={QUESTIONS}
    />
  </Stack>
)
