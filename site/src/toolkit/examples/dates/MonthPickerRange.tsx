import { MonthPicker } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** Statements start when the workspace was made, and
 * the current month isn't billed yet. */
export const MonthPickerRange = () => (
  <MonthPicker
    label="Statement"
    hint="From June 2025, when the workspace began."
    today={TODAY}
    defaultValue="2025-08"
    min="2025-06"
    max="2026-10"
  />
)
