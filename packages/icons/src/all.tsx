// Every icon by name: an app that takes names from data pays for the whole set here, and only here.
import type { IconComponent } from '@weft-js/warp-icons'
import { actions, names, type IconActionName, type IconName, type IconVariant } from './gen/names'
import { lookup } from './lookup'

export { actions, lookup, names, type IconActionName, type IconName, type IconVariant }
export { Icon, type IconByNameProps } from './icon'
/** Every icon, by its name. */
export const icons = Object.fromEntries(names.map(n => [n, lookup(n)])) as Record<IconName, IconComponent>
