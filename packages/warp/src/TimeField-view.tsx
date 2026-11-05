// Render the time picker under its caller's owner.
import { ClockIcon } from '@weft-js/warp-icons'
import { fmtTime, type IsoTime } from '@weft-js/warp-core'
import { Composite, Hidden, Panel, Trigger } from './Picker'
import { Segments } from './Segments'
import { Slots, Wheels } from './TimeField-options'
import type { timeModel } from './TimeField-model'

type Model = ReturnType<typeof timeModel>

/** Render the time field using its per-instance model. */
export function timeView(m: Model) {
  const live = liveProps(m.input)
  const { input, env, value, pop, started, dst, sheet, text, options, refs } = m
  return (
    <Composite
      {...input.rest()}
      label={live.label}
      hint={dst.value ?? live.hint}
      error={live.error}
      disabled={live.disabled}
      readonly={live.readonly}
      bound={value}
      onReset={() => (started.value = false)}
      filled={value.value !== null || started.value}
      hold={pop.value}
      control={() => timeControls(m)}
      end={
        <Panel
          label={text.value.chooseTime}
          open={pop}
          trigger={() => refs.trigger!}
          presentation={live.presentation}
          align="end"
        >
          {() =>
            sheet.value ? (
              <Wheels
                value={value.value}
                locale={env.locale.value}
                hourCycle={live.hourCycle}
                onChange={(x) => value.set(x, 'pointer')}
              />
            ) : (
              <Slots
                slots={options.value}
                selected={value.value}
                locale={env.locale.value}
                hourCycle={live.hourCycle}
                label={text.value.chooseTime}
                meta
                onPick={(x, r) => {
                  value.set(x as IsoTime, r)
                  pop.set(false)
                }}
              />
            )
          }
        </Panel>
      }
    />
  )
}

function timeControls(m: Model) {
  const live = liveProps(m.input)
  const { input, env, value, pop, text, onEdit, open, refs } = m
  return (
    <>
      <Segments
        required={input.rest().required}
        kind="time"
        options={{ hourCycle: live.hourCycle, seconds: input.seconds() }}
        locale={env.locale.value}
        value={value.value}
        today={env.today.value}
        disabled={live.disabled}
        readonly={live.readonly}
        onEdit={onEdit}
      />
      <Trigger
        el={(n: HTMLButtonElement) => (refs.trigger = n)}
        icon={ClockIcon}
        label={
          text.value.chooseTime +
          (value.value ? `, ${fmtTime(value.value, env.locale.value, live.hourCycle)}` : '')
        }
        open={pop.value}
        disabled={live.disabled}
        onToggle={() => (pop.value ? pop.set(false) : open())}
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
    get hint() {
      return input.hint()
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
    get hourCycle() {
      return input.hourCycle()
    },
  }
}
