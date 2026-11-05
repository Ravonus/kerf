// Render the combined date and time picker under its caller's owner.
import { CalendarIcon } from '@weft-js/warp-icons'
import type { IsoDate } from '@weft-js/warp-core'
import { CalendarGrid } from './Calendar'
import { Composite, Hidden, Panel, Trigger } from './Picker'
import { Segments } from './Segments'
import { DateTimeSlots } from './TimeField-slots'
import type { dateTimeModel } from './TimeField-date-model'

type Model = ReturnType<typeof dateTimeModel>

/** Render the date-time field using its per-instance model. */
export function dateTimeView(m: Model) {
  const live = liveProps(m.input)
  const { input, env, value, pop, date, time, said, refs, emit } = m
  return (
    <Composite
      {...input.rest()}
      label={live.label}
      hint={said.value}
      error={live.error}
      disabled={live.disabled}
      readonly={live.readonly}
      bound={value}
      onReset={() => {
        date.value = value.value?.slice(0, 10) ?? null
        time.value = value.value?.slice(11) ?? null
      }}
      filled={!!(date.value || time.value)}
      hold={pop.value}
      control={() => dateTimeControls(m)}
      end={
        <Panel
          label="Choose date and time"
          open={pop}
          trigger={() => refs.trigger!}
          presentation={live.presentation}
        >
          {() => (
            <div class="dt-pop">
              <CalendarGrid
                mode="single"
                value={() => date.value as IsoDate | null}
                locale={env.locale.value}
                today={env.today.value}
                min={live.min}
                max={live.max}
                isDateUnavailable={live.isDateUnavailable}
                firstDayOfWeek={live.firstDayOfWeek}
                autofocus
                onPick={(iso, reason) => {
                  date.value = iso
                  emit(reason)
                }}
              />
              <div class="dt-side">
                <p class="dt-cap">Time</p>
                {DateTimeSlots({
                  get step() {
                    return live.step!
                  },
                  m,
                })}
              </div>
            </div>
          )}
        </Panel>
      }
    />
  )
}

function dateTimeControls(m: Model) {
  const live = liveProps(m.input)
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
        disabled={live.disabled}
        readonly={live.readonly}
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
        disabled={live.disabled}
        readonly={live.readonly}
        onEdit={onTime}
      />
      <Trigger
        el={(n: HTMLButtonElement) => (refs.trigger = n)}
        icon={CalendarIcon}
        label="Choose date and time"
        open={pop.value}
        disabled={live.disabled}
        onToggle={() => pop.set(!pop.value)}
      />
      <Hidden name={live.name} value={() => value.value ?? ''} />
    </>
  )
}

function liveProps(input: Model['input']) {
  return {
    get label() {
      return input.label()
    },
    get error() {
      return input.error()
    },
    get disabled() {
      return input.disabled()
    },
    get readonly() {
      return input.readonly()
    },
    get name() {
      return input.name()
    },
    get presentation() {
      return input.presentation()
    },
    get min() {
      return input.min()
    },
    get max() {
      return input.max()
    },
    get isDateUnavailable() {
      return input.isDateUnavailable()
    },
    get firstDayOfWeek() {
      return input.firstDayOfWeek()
    },
    get step() {
      return input.step()
    },
  }
}
