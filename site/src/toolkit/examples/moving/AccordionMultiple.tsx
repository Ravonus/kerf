import { Accordion } from '@kerf/veneer'
import { QUESTIONS } from './shared'

export const AccordionMultiple = () => (
  <Accordion
    multiple
    defaultOpen={['rollback', 'bill']}
    items={QUESTIONS}
  />
)
