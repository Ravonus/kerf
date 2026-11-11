// An icon by name. Apart from all.tsx so that names.tsx can use it without going through `Icon`, which imports names.tsx.
import * as all from '@kerf/veneer-icons'
import type { IconComponent } from '@kerf/veneer-icons'

const table = all as unknown as Record<string, IconComponent>
const title = (name: string) => name.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())

/** The icon of a kebab-case name, in `solid` or `action` if asked: undefined for a name nobody drew. */
export const lookup = (name: string, variant?: string): IconComponent | undefined =>
  table[`${title(name)}Icon${variant ? variant[0]!.toUpperCase() + variant.slice(1) : ''}`]
