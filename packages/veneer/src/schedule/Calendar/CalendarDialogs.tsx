import { Button } from '../../Button'
import { Segmented } from '../../Choice'
import { Modal } from '../../Modal'
import { EventEditor } from '../EventEditor'
import { EventPopover } from '../EventPopover'
import { MoveSheet } from '../MoveSheet'

import type { CalendarProps } from '../Calendar'
import { type useCalendarActions, type useCalendarNav } from './calendar-shell'
import type { Ctx } from './calendar-state'
type Nav = ReturnType<typeof useCalendarNav>
type Actions = ReturnType<typeof useCalendarActions>
type Props = { p: CalendarProps; c: Ctx; nav: Nav; actions: Actions; id: string }
export function CalendarModals({ c, actions }: Props) {
  return (
    <>
      <Modal
        open={c.askDelete}
        alert
        size="sm"
        tone="critical"
        title={`Delete ${c.doomed.value?.title ?? 'event'}?`}
        description="It's removed for everyone on it."
        footer={
          <>
            <Button
              emphasis="outline"
              tone="neutral"
              autofocus
              onClick={() => (c.askDelete.value = false)}
            >
              Cancel
            </Button>
            <Button tone="critical" onClick={actions.confirmDelete}>
              Delete
            </Button>
          </>
        }
      ></Modal>
      <Modal
        open={c.scopeOpen}
        size="sm"
        title={`${c.pendingScope.value?.verb ?? 'Change'} repeating event`}
        footer={
          <>
            <Button emphasis="outline" tone="neutral" onClick={actions.dropScope}>
              Cancel
            </Button>
            <Button onClick={actions.applyScope}>{c.pendingScope.value?.verb ?? 'Apply'}</Button>
          </>
        }
      >
        <Segmented
          label="Apply to"
          value={c.scope.value}
          onChange={(v) => (c.scope.value = v)}
          options={[
            { value: 'this', label: 'This event' },
            { value: 'following', label: 'This and following' },
            { value: 'all', label: 'All' },
          ]}
        />
      </Modal>
    </>
  )
}

export function CalendarDialogs({ p, c, nav, actions, id }: Props) {
  return (
    <>
      <EventPopover
        open={c.popOpen}
        event={c.popped.value ? (c.shown(c.popped.value) ?? null) : null}
        anchor={() => c.anchor.value}
        zoneLabel={c.zoneLabel.value}
        locale={c.env.locale.value}
        hourCycle={p.hourCycle}
        side={c.view.value === 'agenda' ? 'bottom' : 'right'}
        onEdit={p.onEdit && !p.readOnly ? c.edit : undefined}
        onDelete={p.onDelete && !p.readOnly ? c.remove : undefined}
        onJoin={p.onJoin}
      />
      <EventEditor
        open={c.editing}
        event={c.draft.value?.event ?? null}
        isNew={c.draft.value?.isNew}
        calendars={p.calendars}
        timeZone={c.zone.value ?? undefined}
        locale={c.env.locale.value}
        today={c.env.today.value}
        onSave={actions.saved}
      />
      <MoveSheet
        open={c.sheet}
        event={c.sheetFor.value}
        events={c.all.value}
        firstDayOfWeek={c.first.value}
        locale={c.env.locale.value}
        hourCycle={p.hourCycle}
        onMove={(e, to) => c.change(e.id, to, 'move', 'touch')}
      />
      <CalendarModals p={p} c={c} nav={nav} actions={actions} id={id} />
    </>
  )
}
