import { MonthPicker } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** The month names come from `locale`, so a German
 * page reads März, not March. */
export const MonthPickerLocale = () => (
  <MonthPicker
    label="Abrechnungsmonat"
    locale="de-DE"
    today={TODAY}
    defaultValue="2026-03"
  />
)
