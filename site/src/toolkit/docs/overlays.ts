import type { DocGroup } from '../types.ts'
import { dialogs } from './overlays/dialogs.ts'
import { popovers } from './overlays/popovers.ts'

export const overlays: DocGroup = {
  file: 'overlays',
  title: 'Overlays',
  intro: 'Things that open above the page. Each one handles focus and closes with Escape.',
  docs: [...dialogs, ...popovers],
}
