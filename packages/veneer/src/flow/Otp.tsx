import { LeftIcon, ShieldCheckIcon } from '@kerf/veneer-icons'
import { clockLabel, otpInput, uid } from '@kerf/veneer-core'
import { derived, state, untrack, watch } from '@kerf/core'
import { Button } from '../Button'
import { use } from '@kerf/veneer-core/kerf'
import {
  Mark,
  FormError,
  StepFrame,
  Submit,
  TextLink,
  Title,
  useCooldown,
  useStepForm,
  type FlowForm,
} from './kit'
import '../fields'
import '@kerf/veneer-core/styles/inputs/field.css'
import '@kerf/veneer-core/styles/inputs/text.css'
import '@kerf/veneer-core/styles/flows/otp.css'
import '@kerf/veneer-core/styles/flows/auth.css'

/** Props for OtpField. */
export interface OtpFieldProps {
  label?: unknown
  name?: string | undefined
  length?: number
  hint?: unknown
  /** Pins every cell critical, clears them and refocuses; the message stays until the next key. */
  error?: unknown
  /** `checking` while the code is verified; `success` runs the cascade. */
  status?: 'idle' | 'checking' | 'success' | undefined
  /** Submit the form on the last digit (default true); `onComplete` runs either way. */
  autoSubmit?: boolean
  onComplete?: (code: string) => void
  onValueChange?: (code: string) => void
  /** Show dots (a PIN). */
  masked?: boolean
  id?: string
}

/**
 * The code input (03 §3, 09 §2.3): one real input painted into cells, so one tab stop, native editing, SMS autofill and
 * paste of the whole code all just work. The active cell holds its sweep.
 */
export function OtpField({
  label = '6-digit code',
  name,
  length = 6,
  hint,
  error,
  status,
  autoSubmit = true,
  onComplete,
  onValueChange,
  masked,
  id: given,
}: OtpFieldProps) {
  const id = untrack(() => given) ?? uid('otp')
  const n = untrack(() => length)
  const half = Math.ceil(n / 2)
  const cells = Array.from({ length: n }, (_, i) => [
    { k: `c${i}`, i },
    ...(i === half - 1 ? [{ k: 'sep', i: -1 }] : []),
  ]).flat()
  const { shown, setRoot } = otpBinding({
    n,
    error: () => error,
    status: () => status,
    onValueChange: (value) => onValueChange?.(value),
    onComplete: (value) => onComplete?.(value),
    autoSubmit: () => autoSubmit,
  })
  return (
    <div data-scope="stack" style="--_gap:8px">
      <label for={id} data-part="code-label">
        {label}
      </label>
      <div
        ref={setRoot}
        data-scope="otp"
        data-invalid={shown.value ? '' : undefined}
        data-state={
          status === 'checking' ? 'pending' : status === 'success' ? 'success' : undefined
        }
        data-masked={masked ? '' : undefined}
      >
        <input
          id={id}
          name={name}
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength={n}
          pattern="[0-9]*"
          enterkeyhint="done"
          data-autofocus=""
          aria-describedby={`${id}-m`}
          aria-invalid={shown.value ? 'true' : undefined}
          aria-busy={status === 'checking' ? 'true' : undefined}
        />
        {cells.map((c) =>
          c.i < 0 ? (
            <span key={c.k} data-part="sep" aria-hidden="true"></span>
          ) : (
            <span key={c.k} data-part="cell" data-sweep="" aria-hidden="true" style={`--n:${c.i}`}>
              <span data-part="sweep-base" aria-hidden="true"></span>
              <span data-part="sweep" aria-hidden="true"></span>
              <b data-part="char"></b>
            </span>
          ),
        )}
      </div>
      <p data-part="message" id={`${id}-m`} role={shown.value ? 'alert' : undefined}>
        {shown.value ?? hint}
      </p>
    </div>
  )
}

function otpBinding({
  n,
  error,
  status,
  onValueChange,
  onComplete,
  autoSubmit,
}: {
  n: number
  error: () => OtpFieldProps['error']
  status: () => OtpFieldProps['status']
  onValueChange: (value: string) => void
  onComplete: (value: string) => void
  autoSubmit: () => boolean
}) {
  // the error shows until the next key, whatever the prop still says
  const shown = state(untrack(error))
  watch(error, (e) => {
    shown.value = e
  })
  let root: HTMLDivElement | undefined
  use(
    otpInput,
    () => root,
    () => ({
      length: n,
      invalid: !!shown.value,
      success: status() === 'success',
      onValue: (v: string) => {
        if (v) shown.value = undefined
        onValueChange(v)
      },
      onComplete(v: string) {
        onComplete(v)
        if (autoSubmit()) root?.querySelector('input')?.form?.requestSubmit()
      },
    }),
  )
  return { shown, setRoot: (el: HTMLDivElement) => (root = el) }
}

/** What the code step submits. */
export interface OtpValues {
  code: string
}

/** Props for OtpStep. */
export interface OtpStepProps extends FlowForm<OtpValues> {
  title?: unknown
  /** "Code sent to •••• 42", or the authenticator line. */
  lede?: unknown
  length?: number
  status?: OtpFieldProps['status'] | undefined
  hint?: unknown
  /** Seconds before Resend opens (default 30). */
  resendIn?: number
  /** Shows Resend; a press restarts the wait. */
  onResend?: () => void
  /** Shows "Use another method". */
  onOtherMethod?: () => void
  otherMethodLabel?: unknown
  onBack?: () => void
}

/** The MFA step (09 §2.1, §2.3): the code, auto-submitted on the last digit, Verify, resend with its countdown, another method, Back. */
export function OtpStep(p: OtpStepProps) {
  const id = uid('otpstep')
  const ctl = useStepForm<OtpValues>(untrack(() => p))
  const n = derived(() => p.length ?? 6)
  const code = state('')
  const round = state(0)
  const left = useCooldown(() => (round.value, p.resendIn ?? 30))
  const resend = () => {
    p.onResend?.()
    round.value++
  }
  const status = derived(() => p.status ?? (ctl.pending.value ? 'checking' : 'idle'))
  return (
    <StepFrame ctl={ctl} embedded={!!p.form} labelledby={`${id}-t`}>
      {p.onBack && (
        <div>
          <Button emphasis="ghost" tone="neutral" size="sm" icon={LeftIcon} onClick={p.onBack}>
            Back
          </Button>
        </div>
      )}
      <Mark>
        <ShieldCheckIcon />
      </Mark>
      <div>
        <Title as={p.heading} id={`${id}-t`}>
          {p.title ?? 'Enter your code'}
        </Title>
        {p.lede !== undefined && <p data-part="lede">{p.lede}</p>}
      </div>
      <FormError ctl={ctl} />
      <OtpField
        name="code"
        length={n.value}
        hint={p.hint ?? ''}
        status={status.value}
        error={ctl.errors.value.code}
        onValueChange={(v) => (code.value = v)}
      />
      <Submit ctl={ctl} disabled={code.value.length !== n.value}>
        Verify
      </Submit>
      {(p.onResend || p.onOtherMethod) && (
        <div data-part="row">
          {p.onResend && (
            <TextLink disabled={left.value > 0} onClick={resend}>
              {left.value > 0 ? `Resend in ${clockLabel(left.value)}` : 'Resend code'}
            </TextLink>
          )}
          {p.onOtherMethod && (
            <TextLink onClick={p.onOtherMethod}>
              {p.otherMethodLabel ?? 'Use another method'}
            </TextLink>
          )}
        </div>
      )}
    </StepFrame>
  )
}
