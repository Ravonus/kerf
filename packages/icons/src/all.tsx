// Every icon by name: an app that takes names from data pays for the whole set here, and only here.
import * as all from '@weft/icons'
import { type IconComponent, type IconProps } from '@weft/icons'
import { untrack } from 'weft'
import { names, type IconName, type IconVariant } from './gen/names'

export { names, type IconName, type IconVariant }
const table = all as unknown as Record<string, IconComponent>
const title = (name: string) => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
export const lookup = (name: string, variant?: string): IconComponent | undefined => table[`${title(name)}Icon${variant ? variant[0].toUpperCase() + variant.slice(1) : ''}`]
export const icons = Object.fromEntries(names.map(n => [n, lookup(n)])) as Record<IconName, IconComponent>

export type IconByNameProps = { name: IconName | IconComponent; hollow?: boolean; solid?: boolean; dither?: boolean } & IconProps
export function Icon({ name, hollow, solid, dither, ...rest }: IconByNameProps) {
  const Draw = untrack(() => (typeof name === 'function' ? name : lookup(name, hollow ? 'hollow' : solid ? 'solid' : dither ? 'dither' : undefined)))
  return Draw ? <Draw {...rest} /> : null
}
