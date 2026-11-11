import { Sunburst } from '@kerf/veneer'

import { SPEND_TREE } from '../../world'

import { dollars } from './shared-dollars'

export const SunburstSpend = () => (
  <Sunburst
    title="October's bill"
    description="By service, then by what it paid for"
    data={SPEND_TREE}
    format={dollars}
    total="October"
  />
)
