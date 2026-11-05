import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/timezone.css'
import '@weft-js/warp-core/styles/rich/phone.css'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import type { TimeZoneId, IsoDate } from '@weft-js/warp-core'
import { untrack } from '@weft-js/core'
import { localZone, zoneRows, zoneCity, matchZone } from '@weft-js/warp-core'
import type { Row } from './list'
import { ListField } from './list'
import { GlobeIcon } from '@weft-js/warp-icons'

/** Props for TimeZoneSelect. */
export type TimeZoneSelectProps = RichFieldProps &
  Bindable<TimeZoneId | null> &
  Openable & { referenceDate?: string | undefined; zones?: TimeZoneId[]; showOffset?: boolean }

/** TimeZoneSelect (04 §2): every IANA zone with its offset at `referenceDate`; Local is pinned first. */
export function TimeZoneSelect({
  referenceDate,
  zones,
  showOffset = true,
  ...props
}: TimeZoneSelectProps) {
  const local = untrack(localZone)
  const matches = new Map<string, ReturnType<typeof zoneRows>[number]>()
  const rows = (locale: string, today: string): Row[] => {
    const list = zoneRows(locale, (referenceDate ?? today) as IsoDate, zones)
    for (const z of list) matches.set(z.zone, z)
    const row = (z: (typeof list)[number]): Row => ({
      key: z.zone,
      main: z.city,
      sub: z.region,
      meta: showOffset ? z.offset : undefined,
      pin: z.zone === local ? 'Local' : undefined,
      search: z.search,
    })
    return [...list.filter((z) => z.zone === local), ...list.filter((z) => z.zone !== local)].map(
      row,
    )
  }
  return (
    <ListField
      icon={GlobeIcon}
      title="Choose a time zone"
      search="City, zone or +5:30"
      text={(v) => zoneCity(v)}
      rows={rows}
      match={(r, q) => matchZone(matches.get(r.key)!, q)}
      count={(n, q) => (q ? `${n} zone${n === 1 ? '' : 's'}` : `${n} zones · offsets for today`)}
      {...props}
    />
  )
}
