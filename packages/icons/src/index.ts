// Per-icon exports with all three tiers and the CSS switch. `icons({ tier })` in weft.config resolves `@weft/icons` to
// one tier instead.
import './tiers.css'
export * from './gen/all'
export { iconSet } from './set'
export type { IconComponent, IconProps } from './svg'
