import { cardDocs } from './showing-cards.ts'
import { typographyDocs } from './showing-typography.ts'
import { codeDocs } from './showing-code.ts'
import type { DocGroup } from '../types.ts'

export const showing: DocGroup = {
  file: 'showing',
  title: 'Content',
  intro: 'Laying out what you already have: cards, labels, numbers, type and code.',
  docs: [...cardDocs, ...typographyDocs, ...codeDocs],
}
