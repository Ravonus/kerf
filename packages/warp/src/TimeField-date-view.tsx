// Render the combined date and time picker under its caller's owner.
import { CalendarIcon } from '@weft-js/warp-icons'
import type { IsoDate } from '@weft-js/warp-core'
import { CalendarGrid } from './Calendar'
import { Composite, Hidden, Panel, Trigger } from './Picker'
import { Segments } from './Segments'
import { Slots } from './TimeField-options'
import { stepSlots } from './TimeField-slots'
import type { dateTimeModel } from './TimeField-date-model'

type Model = ReturnType<typeof dateTimeModel>

/** Render the date-time field using its per-instance model. */
export function dateTimeView(m: Model) {
  const { input, value, pop, date, time, said } = m
  return (
    <Composite
      {...input.rest()}
      label={input.label()}
      hint={said.value}
      error={input.error()}
      disabled={input.disabled()}
      readonly={input.readonly()}
      bound={value}
      onReset={() => {
        date.value = value.value?.slice(0, 10) ?? null
        time.value = value.value?.slice(11) ?? null
      }}
      filled={!!(date.value || time.value)}
      hold={pop.value}
      control={() => dateTimeControls(m)}
      end={dateTimePanel(m)}
    />
  )
}

function dateTimeControls(m: Model) {
  const { input, env, value, pop, date, time, refs, onDate, onTime } = m
  return (
    <>
      <Segments
        required={input.rest().required}
        kind="date"
        label="Date"
        locale={env.locale.value}
        value={date.value}
        today={env.today.value}
        disabled={input.disabled()}
        readonly={input.readonly()}
        onEdit={onDate}
      />
      <span data-part="literal" class="dt-sep" aria-hidden="true">
        ·
      </span>
      <Segments
        required={input.rest().required}
        kind="time"
        label="Time"
        locale={env.locale.value}
        value={time.value}
        today={env.today.value}
        disabled={input.disabled()}
        readonly={input.readonly()}
        onEdit={onTime}
      />
      <Trigger
        el={(n: HTMLButtonElement) => (refs.trigger = n)}
        icon={CalendarIcon}
        label="Choose date and time"
        open={pop.value}
        disabled={input.disabled()}
        onToggle={() => pop.set(!pop.value)}
      />
      <Hidden name={input.name()} value={() => value.value ?? ''} />
    </>
  )
}

function dateTimePanel(m: Model) {
  const { input, env, pop, date, time, refs, emit } = m
  return (
    <Panel
      label="Choose date and time"
      open={pop}
      trigger={() => refs.trigger!}
      presentation={input.presentation()}
    >
      {() => (
        <div class="dt-pop">
          <CalendarGrid
            mode="single"
            value={() => date.value as IsoDate | null}
            locale={env.locale.value}
            today={env.today.value}
            min={input.min()}
            max={input.max()}
            isDateUnavailable={input.isDateUnavailable()}
            firstDayOfWeek={input.firstDayOfWeek()}
            autofocus
            onPick={(iso, reason) => {
              date.value = iso
              emit(reason)
            }}
          />
          <div class="dt-side">
            <p class="dt-cap">Time</p>
            <Slots
              slots={stepSlots(input.step()!)}
              selected={time.value}
              locale={env.locale.value}
              label="Time"
              onPick={(x, reason) => {
                time.value = x
                emit(reason)
                pop.set(false)
              }}
            />
          </div>
        </div>
      )}
    </Panel>
  )
}
