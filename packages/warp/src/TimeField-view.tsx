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
  const { input, value, pop, started, dst } = m
  return (
    <Composite
      {...input.rest()}
      label={input.label()}
      hint={dst.value ?? input.hint()}
      error={input.error()}
      disabled={input.disabled()}
      readonly={input.readonly()}
      bound={value}
      onReset={() => (started.value = false)}
      filled={value.value !== null || started.value}
      hold={pop.value}
      control={() => timeControls(m)}
      end={timePanel(m)}
    />
  )
}

function timeControls(m: Model) {
  const { input, env, value, pop, text, onEdit, open, refs } = m
  return (
    <>
      <Segments
        required={input.rest().required}
        kind="time"
        options={{ hourCycle: input.hourCycle(), seconds: input.seconds() }}
        locale={env.locale.value}
        value={value.value}
        today={env.today.value}
        disabled={input.disabled()}
        readonly={input.readonly()}
        onEdit={onEdit}
      />
      <Trigger
        el={(n: HTMLButtonElement) => (refs.trigger = n)}
        icon={ClockIcon}
        label={
          text.value.chooseTime +
          (value.value ? `, ${fmtTime(value.value, env.locale.value, input.hourCycle())}` : '')
        }
        open={pop.value}
        disabled={input.disabled()}
        onToggle={() => (pop.value ? pop.set(false) : open())}
      />
      <Hidden name={input.name()} value={() => value.value ?? ''} />
    </>
  )
}

function timePanel(m: Model) {
  const { input, env, value, pop, sheet, text, options, refs } = m
  return (
    <Panel
      label={text.value.chooseTime}
      open={pop}
      trigger={() => refs.trigger!}
      presentation={input.presentation()}
      align="end"
    >
      {() =>
        sheet.value ? (
          <Wheels
            value={value.value}
            locale={env.locale.value}
            hourCycle={input.hourCycle()}
            onChange={(x) => value.set(x, 'pointer')}
          />
        ) : (
          <Slots
            slots={options.value}
            selected={value.value}
            locale={env.locale.value}
            hourCycle={input.hourCycle()}
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
  )
}
