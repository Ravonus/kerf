import { Accordion } from '@weft-js/warp'
import { QUESTIONS } from './shared'

export const AccordionBoxed = () => (
  <Accordion
    defaultOpen={['rollback']}
    items={QUESTIONS}
  />
)
