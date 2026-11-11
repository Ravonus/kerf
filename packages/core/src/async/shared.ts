import { context, type State } from '../index'
import type { ResourceOptions } from './types'

export const timing = { showAfter: 150, hold: 400 }

export type Tracked = {
  first: State<boolean>
  err: State<unknown>
  refresh(): void
  shape?: ResourceOptions<unknown>['shape']
}
export const boundaries = context<{ add(r: Tracked): void } | undefined>(undefined)
/** While a Boundary's `pending` renders: the resources it's waiting for (@kerf-js/core/shape). */
export const waiting = context<Tracked[] | undefined>(undefined)
