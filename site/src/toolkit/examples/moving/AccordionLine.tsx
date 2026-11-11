import { Accordion } from '@kerf-js/veneer'
import { QUESTIONS } from './shared'

export const AccordionLine = () => (
  <Accordion
    variant="line"
    defaultOpen={['rollback']}
    items={QUESTIONS}
  />
)
