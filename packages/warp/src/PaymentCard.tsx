import { CardIcon } from '@weft-js/warp-icons'
import { cardBrand, cardMask } from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { Field, type FieldShell } from './Field'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/rich/payment.css'

/** The card field a payment provider mounts, as far as warp talks to it. */
export interface ProviderField { on(e: 'focus' | 'blur' | 'change', f: (ev: { complete?: boolean | undefined; error?: string | undefined }) => void): void; destroy(): void }
/** The field styles warp hands a provider, since its iframe can't read ours. */
export interface ProviderAppearance { fontFamily: string; fontSize: string; color: string; errorColor: string; borderRadius: string; borderColor: string }
/** Props for PaymentCardInput. */
export type PaymentCardInputProps = FieldShell & { mount: (el: HTMLElement, appearance: ProviderAppearance) => ProviderField }

/**
 * PaymentCardInput (04 §5): the field shell around the provider's hosted field, driven by its events, with warp's
 * tokens passed into its appearance API. warp never renders an input for a raw card number.
 */
export function PaymentCardInput({ mount, label, hint, error, ...rest }: PaymentCardInputProps) {
  const focused = state(false)
  const filled = state(false)
  const failed = state<string | undefined>(undefined)
  let host: HTMLDivElement | undefined
  const attach = (el: HTMLDivElement) => {
    const css = getComputedStyle(el)
    const token = (t: string) => css.getPropertyValue(`--warp-${t}`).trim()
    const field = untrack(() => mount)(el, { fontFamily: css.fontFamily, fontSize: token('text-control-size'), color: token('color-text'), errorColor: token('color-critical-text'), borderRadius: token('radius-control'), borderColor: token('color-border-control') })
    field.on('focus', () => (focused.value = true))
    field.on('blur', () => (focused.value = false))
    field.on('change', ev => { filled.value = ev.complete ?? filled.value; failed.value = ev.error })
    return { update() {}, destroy: () => field.destroy() }
  }
  use(attach, () => host)
  return (
    <Field
      icon={CardIcon}
      {...rest}
      group
      label={label}
      hint={hint ?? 'Secured by your payment provider. warp never sees the number.'}
      error={error ?? failed.value}
      filled={filled.value}
      hold={focused.value}
      control={() => <div ref={n => (host = n)} data-part="provider" role="group" aria-label={`${label}, hosted by the payment provider`}></div>}
    />
  )
}

/** Props for CardNumberText. */
export type CardNumberTextProps = { last4: string; bin?: string; brand?: string; expiry?: { month: number; year: number } }

/** CardNumberText (04 §5): the display of a saved card, `•••• 4242`, with the brand from the BIN and expiry as MM/YY. */
export function CardNumberText({ last4, bin, brand, expiry }: CardNumberTextProps) {
  const name = derived(() => brand ?? cardBrand(bin ?? ''))
  const exp = derived(() => (expiry ? `${String(expiry.month).padStart(2, '0')}/${String(expiry.year % 100).padStart(2, '0')}` : ''))
  // a span can't be named (aria-prohibited-attr): the mask is hidden from screen readers and the words are said instead
  return (
    <span data-card-text="">
      <span aria-hidden="true">{name.value ? `${name.value} ` : ''}{cardMask(last4, name.value)}{exp.value ? ` · ${exp.value}` : ''}</span>
      <span data-part="sr-only">{`${name.value || 'Card'} ending ${last4}`}{exp.value ? `, expires ${exp.value}` : ''}</span>
    </span>
  )
}
