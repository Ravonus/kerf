import { Accordion } from '@kerf-js/veneer'
import { QUESTIONS } from './shared'

export const AccordionBoxed = () => (
  <Accordion
    defaultOpen={['rollback']}
    items={QUESTIONS}
  />
)
