// A name to its icon. This file is what dev and tests see, with every icon in. A build swaps it for a module holding only
// the names the app uses (compile.mjs), so nothing here reaches production unless a name is truly dynamic.
import * as all from '@kerf/veneer-icons'
import type { IconComponent } from '@kerf/veneer-icons'
import type { IconActionName, IconName, IconVariant } from './gen/names'
import { lookup } from './lookup'

export type { IconActionName, IconName, IconVariant }
/** The icon of a name, or undefined. A build's version knows only the names the app uses. */
export const resolve = lookup
/** `Icons[id]` for an id only known at runtime. The build's version does the same over what it kept. */
export const pack = (id: string) => (all as unknown as Record<string, IconComponent>)[id]
