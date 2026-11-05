import { state } from '@weft-js/core'
import { popover, uid } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { GlobeIcon } from '@weft-js/warp-icons'
import { TimeZoneSelect } from '../../RichSelect'
import { Tooltip } from '../../Tooltip'

import type { Ctx } from './calendar-state'

/** The toolbar's zone chip: TimeZoneSelect (04 §2) in a popover. */
export function ZoneChip({ c }: { c: Ctx }) {
  const id = uid('zone')
  const open = state(false)
  const built = state(false)
  let chip: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(
    popover,
    () => panel,
    () => ({
      open: open.value,
      trigger: chip!,
      side: 'bottom' as const,
      align: 'end' as const,
      onClose: () => (open.value = false),
    }),
  )
  return (
    <>
      <Tooltip content={`Times shown in ${c.zone.value}`}>
        <button
          ref={(n) => (chip = n)}
          type="button"
          data-part="tz"
          aria-haspopup="dialog"
          aria-expanded={open.value ? 'true' : 'false'}
          aria-controls={id}
          onClick={() => {
            built.value = true
            open.value = !open.value
          }}
        >
          <GlobeIcon />
          {c.zoneLabel.value}
        </button>
      </Tooltip>
      <div
        ref={(n) => (panel = n)}
        id={id}
        data-scope="popover"
        data-part="content"
        popover="manual"
        role="dialog"
        aria-label="Time zone"
      >
        {built.value && (
          <TimeZoneSelect
            label="Time zone"
            value={c.zone.value}
            referenceDate={c.date.value}
            today={c.env.today.value}
            locale={c.env.locale.value}
            onValueChange={(z: string | null) => {
              c.zone.set(z)
              open.value = false
              c.say(`Times shown in ${z}`)
            }}
          />
        )}
      </div>
    </>
  )
}
