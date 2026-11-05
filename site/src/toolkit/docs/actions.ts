import { buttonDocs } from './actions-button.ts'
import { controlDocs } from './actions-controls.ts'
import type { DocGroup } from '../types.ts'

export const actions: DocGroup = {
  file: 'actions',
  title: 'Actions',
  intro: 'Things people press to make something happen.',
  docs: [...buttonDocs, ...controlDocs],
}
