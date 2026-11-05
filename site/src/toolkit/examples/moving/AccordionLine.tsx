import { Accordion } from '@weft-js/warp'
import { QUESTIONS } from './shared'

export const AccordionLine = () => (
  <Accordion variant="line" defaultOpen={['rollback']} items={QUESTIONS} />
)
