// A name to its icon. This file is what dev and tests see, with every icon in. A build swaps it for a module holding only
// the names the app uses (compile.mjs), so nothing here reaches production unless a name is truly dynamic.
import * as all from '@weft/icons'
import type { IconComponent } from '@weft/icons'
import { lookup, type IconName, type IconVariant } from './all'

export type { IconName, IconVariant }
export const resolve = lookup
/** `Icons[id]` for an id only known at runtime. The build's version does the same over what it kept. */
export const pack = (id: string) => (all as unknown as Record<string, IconComponent>)[id]
