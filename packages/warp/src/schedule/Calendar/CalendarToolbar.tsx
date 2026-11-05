import { LeftIcon, PlusIcon, RightIcon } from '@weft-js/warp-icons'
import { Button } from '../../Button'
import { LiveStatus } from '../../parts'
import { Popover } from '../../Popover'

import type { CalendarProps } from '../Calendar'
import { LABEL, type useCalendarActions, type useCalendarNav } from './calendar-shell'
import type { Ctx } from './calendar-state'
import { MiniMonth } from './MiniMonth'
import { ZoneChip } from './ZoneChip'
type Nav = ReturnType<typeof useCalendarNav>
type Actions = ReturnType<typeof useCalendarActions>
type Props = { p: CalendarProps; c: Ctx; nav: Nav; actions: Actions; id: string }
export function CalendarTabs({ c, nav, id }: Props) {
  return (
    <div data-scope="tabs" data-variant="pill" data-part="root">
      <div
        ref={nav.setTabs}
        data-part="list"
        role="tablist"
        aria-label="Calendar view"
        onKeyDown={nav.onTabKey}
      >
        {nav.views.value.map((v) => (
          <button
            key={v}
            type="button"
            data-part="trigger"
            role="tab"
            id={`${id}-${v}`}
            aria-controls={`${id}-main`}
            aria-selected={v === c.view.value ? 'true' : 'false'}
            tabindex={v === c.view.value ? undefined : '-1'}
            onClick={() => nav.setView(v)}
          >
            {LABEL[v]}
          </button>
        ))}
        <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      </div>
    </div>
  )
}

export function CalendarToolbar({ p, c, nav, actions, id }: Props) {
  return (
    <div data-part="app-bar" class="row">
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        icon={LeftIcon}
        label={`Previous ${nav.unit.value}`}
        onClick={() => nav.step(-1)}
      />
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        icon={RightIcon}
        label={`Next ${nav.unit.value}`}
        onClick={() => nav.step(1)}
      />
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        onClick={() => c.date.set(c.env.today.value)}
      >
        Today
      </Button>
      {nav.tablet.value ? (
        <Popover
          label={nav.title.value}
          title="Go to a date"
          trigger={{ emphasis: 'ghost', tone: 'neutral', size: 'sm' }}
        >
          <span data-scope="calendar">
            <MiniMonth c={c} />
          </span>
        </Popover>
      ) : (
        <h3 data-part="app-title">
          <span data-part="range-label">
            {nav.title.value} <small>{nav.week.value && `· ${nav.week.value}`}</small>
          </span>
        </h3>
      )}
      <span data-part="spacer"></span>
      {p.live && (
        <LiveStatus state={p.live} label="Calendar sync">
          {p.live === 'live' ? 'Synced' : undefined}
        </LiveStatus>
      )}
      {c.zone.value && <ZoneChip c={c} />}
      <CalendarTabs p={p} c={c} nav={nav} actions={actions} id={id} />
      {!p.readOnly && p.onCreate && (
        <Button size="sm" onClick={nav.createNow}>
          <PlusIcon />
          New event
        </Button>
      )}
    </div>
  )
}
