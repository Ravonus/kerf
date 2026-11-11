import { Accordion } from '@kerf/veneer'
import { QUESTIONS } from './shared'

export const AccordionBoxed = () => (
  <Accordion
    defaultOpen={['rollback']}
    items={QUESTIONS}
  />
)
