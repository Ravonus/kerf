import { DateField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- DateField

export const DateFieldPlay = (p: {
  label: string
  hint?: string | undefined
  disabled?: boolean | undefined
  weekNumbers?: boolean | undefined
}) => (
  <DateField
    defaultValue="2026-11-14"
    today={TODAY}
    {...p}
  />
)
