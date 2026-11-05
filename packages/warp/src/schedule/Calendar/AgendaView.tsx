import { derived } from '@weft-js/core'
import { fmt, viewDays } from '@weft-js/warp-core'
import { AgendaDay } from '../Agenda'

import type { Ctx } from './calendar-state'

export function AgendaView({ c }: { c: Ctx }) {
  const days = derived(() => viewDays('week', c.date.value, c.first.value))
  return (
    <div data-part="scroller">
      <div data-scope="agenda">
        <div
          data-part="page"
          onClick={(e: MouseEvent) => {
            const el = (e.target as Element).closest?.<HTMLElement>('[data-id]')
            if (el) c.openPopover(el.dataset.id!, el)
          }}
          onKeyDown={(e: KeyboardEvent) => {
            const el = (e.target as Element).closest?.<HTMLElement>('[data-id]')
            if (el && e.key === 'Enter') c.openPopover(el.dataset.id!, el)
          }}
        >
          {days.value.map((d) => (
            <section key={d}>
              <div data-part="day-title">
                <h4>{fmt(d, { weekday: 'long' }, c.env.locale.value)}</h4>
                <span class="muted">
                  {fmt(d, { month: 'short', day: 'numeric' }, c.env.locale.value)}
                </span>
              </div>
              <AgendaDay
                events={c.visible.value}
                day={d}
                now={c.now.value}
                locale={c.env.locale.value}
                hourCycle={c.p.hourCycle}
                label={fmt(d, { weekday: 'long' }, c.env.locale.value)}
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
