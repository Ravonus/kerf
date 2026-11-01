// Every icon by name: an app that takes names from data pays for the whole set here, and only here.
import * as all from '@weft/icons'
import { iconSet, type IconComponent } from '@weft/icons'
import { names, type IconName } from './gen/names'

export { names, type IconName }
const pascal = (name: string) => 'Icon' + name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
export const icons = Object.fromEntries(names.map(n => [n, (all as unknown as Record<string, IconComponent>)[pascal(n)]])) as Record<IconName, IconComponent>
export const Icon = iconSet(icons)
