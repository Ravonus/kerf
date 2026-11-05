import { WeekPicker } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const WeekPickerLocale = () => (
  <WeekPicker
    label="Payroll week"
    today={TODAY}
    defaultValue="2026-W45"
    numbering="locale"
  />
)
