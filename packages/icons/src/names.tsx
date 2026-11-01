// A name to its icon. This file is what dev and tests see, with every icon in. A build swaps it for a module holding only
// the names the app uses (compile.mjs), so nothing here reaches production unless a name is truly dynamic.
import type { IconComponent } from './svg'
import { icons, type IconName } from './all'

export type { IconName }
export const resolve = (name: string): IconComponent | undefined => (icons as Record<string, IconComponent>)[name]
