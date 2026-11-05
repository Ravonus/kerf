import type { DocGroup } from '../types.ts'
import { fieldsSelectors } from './fields/selectors.ts'
import { fieldsEntry } from './fields/entry.ts'
import { fieldsEditors } from './fields/editors.ts'

export const fields: DocGroup = {
  file: 'fields',
  title: 'Rich fields',
  intro: 'Phones, addresses, cards, code, signatures and text editors.',
  pack: true,
  docs: [...fieldsSelectors, ...fieldsEntry, ...fieldsEditors],
}
