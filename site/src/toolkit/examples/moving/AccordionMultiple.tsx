import { Accordion } from '@weft-js/warp'
import { QUESTIONS } from './shared'

export const AccordionMultiple = () => (
  <Accordion
    multiple
    defaultOpen={['rollback', 'bill']}
    items={QUESTIONS}
  />
)
