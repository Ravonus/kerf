import type { DocGroup } from '../types.ts'
import { navigation } from './moving/navigation.ts'
import { menus } from './moving/menus.ts'
import { paging } from './moving/pagination-links.ts'
import { presence } from './moving/presence.ts'

export const moving: DocGroup = {
  file: 'moving',
  title: 'Navigation',
  intro: 'Showing one part of a page at a time, and getting between pages.',
  docs: [...navigation, ...menus, ...paging, ...presence],
}
