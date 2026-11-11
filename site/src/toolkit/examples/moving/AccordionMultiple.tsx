import { Accordion } from '@kerf-js/veneer'
import { QUESTIONS } from './shared'

export const AccordionMultiple = () => (
  <Accordion
    multiple
    defaultOpen={['rollback', 'bill']}
    items={QUESTIONS}
  />
)
