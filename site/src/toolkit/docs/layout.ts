import type { DocGroup } from '../types.ts'
import { flow } from './layout/flow.ts'
import { placement } from './layout/placement.ts'
import { framing } from './layout/framing.ts'

export const layout: DocGroup = {
  file: 'layout',
  title: 'Layout',
  intro:
    'Stacks, grids and the shell around your pages. They answer to their container, not the screen.',
  docs: [...flow, ...placement, ...framing],
}
