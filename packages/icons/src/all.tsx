// Every icon by name: an app that takes names from data pays for the whole set here, and only here.
import * as all from '@weft/icons'
import type { IconComponent } from '@weft/icons'
import { names, type IconName, type IconVariant } from './gen/names'

export { names, type IconName, type IconVariant }
export { Icon, type IconByNameProps } from './icon'
const table = all as unknown as Record<string, IconComponent>
const title = (name: string) => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
export const lookup = (name: string, variant?: string): IconComponent | undefined => table[`${title(name)}Icon${variant ? variant[0].toUpperCase() + variant.slice(1) : ''}`]
export const icons = Object.fromEntries(names.map(n => [n, lookup(n)])) as Record<IconName, IconComponent>
