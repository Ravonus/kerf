import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/timezone.css'
import '@weft-js/warp-core/styles/rich/phone.css'
import type { RichFieldProps, Bindable } from '../Picker'
import type { E164, CountryCode, PhoneCountry } from '@weft-js/warp-core'
import { usePickerEnv, bindable, useOpen } from '../Picker'
import { untrack, state, derived } from '@weft-js/core'
import {
  PHONE_COUNTRIES,
  regionOf,
  inferCountry,
  formatPhone,
  displayName,
  digitsOf,
  caretAfter,
  nationalLength,
} from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { Field } from '../Field'
import { PhoneControl, PhonePanel, type PhoneView } from './phone-view'

/** A prefix moves where the label rests: onto the input, past the country button (specimen, `restOn`). */
function restOnInput(el: HTMLInputElement) {
  const control = el.closest<HTMLElement>('[data-part="control"]')!
  const measure = () => {
    if (!control.style.getPropertyValue('--_inset'))
      control.style.setProperty('--_inset', getComputedStyle(el.parentElement!).paddingInlineStart)
    control.style.setProperty(
      '--_lead',
      `${Math.round(el.getBoundingClientRect().left - control.getBoundingClientRect().left)}px`,
    )
  }
  measure()
  const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
  size?.observe(control)
  return {
    update() {},
    destroy() {
      size?.disconnect()
    },
  }
}

/** Props for PhoneField. */
export type PhoneFieldProps = RichFieldProps &
  Bindable<E164 | null> & {
    country?: CountryCode
    defaultCountry?: CountryCode
    countries?: CountryCode[] | undefined
    onCountryChange?: (c: CountryCode) => void
  }

/**
 * PhoneField (04 §3): a country button, then a native tel input (the OS keypad and SMS autofill beat anything custom).
 * Digits format as you type and the caret stays behind the same digit; a pasted `+…` infers the country. The value is
 * E.164, and only once the number is the country's length. The country list is a search list.
 */
export function PhoneField({
  value,
  defaultValue,
  onValueChange,
  country,
  defaultCountry,
  countries,
  onCountryChange,
  locale,
  today,
  name,
  presentation,
  label,
  hint,
  error,
  disabled,
  readonly,
  ...rest
}: PhoneFieldProps) {
  const { env, v, list, find, code, text, pop, own, name_, placeholder } = phoneState(
    () => value,
    () => defaultValue,
    () => onValueChange,
    () => country,
    () => defaultCountry,
    () => countries,
    () => locale,
    () => today,
  )
  let button: HTMLButtonElement | undefined
  let input: HTMLInputElement | undefined
  const actions = phoneActions(
    code,
    text,
    own,
    name_,
    v,
    pop,
    list,
    () => input,
    () => onCountryChange,
    () => readonly,
  )
  use(restOnInput, () => input)
  const view = phoneView(
    { code, text, name: name_, placeholder, value: v, pop, env, list, find, actions },
    () => readonly,
    () => disabled,
    () => name,
    () => presentation,
    () => button!,
    (n) => (button = n),
    (n) => (input = n),
  )

  return (
    <Field
      {...rest}
      label={label}
      hint={hint}
      error={error ?? own.value}
      disabled={disabled}
      readonly={readonly}
      filled={text.value.length > 0}
      hold={pop.value}
      attrs={{ 'data-phone': '' }}
      reset={actions.reset}
      control={(p) => <PhoneControl view={view} p={p} />}
      end={<PhonePanel view={view} />}
    />
  )
}

function phoneActions(
  code: ReturnType<typeof state<PhoneCountry>>,
  text: ReturnType<typeof state<string>>,
  own: ReturnType<typeof state<string | undefined>>,
  name_: { readonly value: string },
  v: ReturnType<typeof bindable<E164 | null>>,
  pop: ReturnType<typeof useOpen>,
  list: PhoneCountry[],
  getInput: () => HTMLInputElement | undefined,
  onCountryChange: () => PhoneFieldProps['onCountryChange'],
  isReadonly: () => boolean | undefined,
) {
  const sync = (raw: string, caret: number | null) => {
    const c = code.value
    const before = digitsOf(raw.slice(0, caret ?? raw.length)).length
    const { shown, national } = formatPhone(raw, c)
    text.value = shown
    const input = getInput()
    if (input) {
      input.value = shown
      if (input === input.ownerDocument.activeElement) {
        const at = caretAfter(shown, before)
        input.setSelectionRange(at, at)
      }
    }
    const need = nationalLength(c)
    own.value =
      national.length > need
        ? `${name_.value} numbers have ${need} digits after the country code.`
        : undefined
    const e = national.length === need ? (`+${c.dial}${national}` as E164) : null
    if (e !== untrack(() => v.value)) v.set(e, 'keyboard')
  }
  const choose = (c: PhoneCountry) => {
    code.value = c
    untrack(onCountryChange)?.(c.code)
    pop.set(false)
    getInput()?.focus()
    sync(text.value, null)
  }
  const onBlur = () => {
    const c = code.value
    const n = formatPhone(text.value, c).national.length,
      need = nationalLength(c)
    if (n && n < need) own.value = `That's ${n} digits. ${name_.value} numbers have ${need}.`
  }
  const onPaste = (e: ClipboardEvent) => {
    if (isReadonly()) return
    const t = e.clipboardData?.getData('text').trim() ?? ''
    if (!t.startsWith('+')) return
    const m = inferCountry(t, code.value, list)
    if (!m) return
    e.preventDefault()
    code.value = m
    sync((m.trunk ?? '') + digitsOf(t).slice(m.dial.length), null)
  }
  const reset = () => {
    v.reset()
    own.value = undefined
    code.value = inferCountry(v.value ?? '', code.value, list) ?? code.value
    text.value = v.value
      ? formatPhone(v.value.slice(code.value.dial.length + 1), code.value).shown
      : ''
    const input = getInput()
    if (input) input.value = text.value
  }
  return { sync, choose, onBlur, onPaste, reset }
}

function phoneState(
  value: () => PhoneFieldProps['value'],
  defaultValue: () => PhoneFieldProps['defaultValue'],
  onValueChange: () => PhoneFieldProps['onValueChange'],
  country: () => PhoneFieldProps['country'],
  defaultCountry: () => PhoneFieldProps['defaultCountry'],
  countries: () => PhoneFieldProps['countries'],
  locale: () => PhoneFieldProps['locale'],
  today: () => PhoneFieldProps['today'],
) {
  const env = usePickerEnv(locale, today)
  const v = bindable<E164 | null>(value, defaultValue, null, onValueChange)
  const list = untrack(() =>
    countries() ? PHONE_COUNTRIES.filter((c) => countries()!.includes(c.code)) : PHONE_COUNTRIES,
  )
  const find = (code?: string) => list.find((c) => c.code === code)
  const code = state<PhoneCountry>(
    untrack(
      () =>
        find(country()) ?? find(defaultCountry()) ?? find(regionOf(env.locale.value)) ?? list[0]!,
    ),
  )
  const text = state(
    untrack(() => {
      const e = v.value
      if (!e) return ''
      const c = inferCountry(e, code.value, list) ?? code.value
      code.value = c
      return formatPhone(e.slice(c.dial.length + 1), c).shown
    }),
  )
  const pop = useOpen(
    () => undefined,
    () => false,
    () => undefined,
  )
  const own = state<string | undefined>(undefined)
  const name_ = derived(() => displayName('region', code.value.code, env.locale.value))
  const placeholder = derived(() => {
    const c = code.value
    return c.pattern.replace(/#/g, '0').replace(/^0/, c.trunk ? '0' : '5')
  })
  return { env, v, list, find, code, text, pop, own, name_, placeholder }
}

function phoneView(
  data: Omit<
    PhoneView,
    'readonly' | 'disabled' | 'fieldName' | 'presentation' | 'button' | 'setButton' | 'setInput'
  >,
  readonly: () => PhoneView['readonly'],
  disabled: () => PhoneView['disabled'],
  fieldName: () => PhoneView['fieldName'],
  presentation: () => PhoneView['presentation'],
  button: PhoneView['button'],
  setButton: PhoneView['setButton'],
  setInput: PhoneView['setInput'],
): PhoneView {
  return {
    ...data,
    get readonly() {
      return readonly()
    },
    get disabled() {
      return disabled()
    },
    get fieldName() {
      return fieldName()
    },
    get presentation() {
      return presentation()
    },
    button,
    setButton,
    setInput,
  }
}
