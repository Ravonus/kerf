import { clock, fmt, longDuration } from '@kerf-js/veneer-core'
import { Button } from '../Button'
import { SweepParts } from './bits'
import type { bookingModel } from './BookingCalendarModel'

type Model = ReturnType<typeof bookingModel>

export function BookingSlots({
  model,
  hourCycle,
}: {
  model: Model
  hourCycle: string | undefined
}) {
  return (
    <>
      <div
        data-part="slots"
        role="group"
        aria-label={`Times on ${fmt(model.date.value!, { dateStyle: 'full' }, model.env.locale.value)}`}
        onKeyDown={model.onSlots}
      >
        {model.list.value.map((x) => (
          <button
            key={x.s}
            type="button"
            data-part="slot"
            data-sweep=""
            aria-pressed={x.s === model.pick.value ? 'true' : 'false'}
            disabled={x.disabled}
            onClick={() => {
              model.pick.value = x.s
              model.stage.value = 'pick'
            }}
          >
            <SweepParts />
            {clock(x.s, model.env.locale.value, hourCycle)}
          </button>
        ))}
      </div>
      {model.empty.value && <p class="muted">No times left on this day.</p>}
    </>
  )
}

export function BookingDone({ model }: { model: Model }) {
  return (
    <div data-arrive="" class="row" role="status">
      <div>
        <b>Booked · {model.when.value}</b>
        <p class="muted">{longDuration(model.len.value)}. We've sent the details.</p>
      </div>
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        onClick={() => {
          model.stage.value = 'pick'
          model.pick.value = null
        }}
      >
        Book another
      </Button>
    </div>
  )
}

export function BookingConfirm({ model }: { model: Model }) {
  return (
    <div class="row" data-confirm-step="">
      <span>
        <b>{model.when.value}</b> <span class="muted">{longDuration(model.len.value)}</span>
      </span>
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        onClick={() => (model.stage.value = 'pick')}
      >
        Back
      </Button>
      <Button size="sm" loading={model.busy.value} onClick={model.book}>
        Confirm
      </Button>
    </div>
  )
}
