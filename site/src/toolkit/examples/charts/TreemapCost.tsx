import { Treemap } from '@kerf-js/veneer'

import { PROJECT_TREE } from '../../world'

import { dollars, thousands } from './shared-dollars'

export const TreemapCost = () => (
  <Treemap
    title="Cost by project"
    description="Grouped by team"
    data={PROJECT_TREE}
    format={dollars}
    short={thousands}
  />
)
