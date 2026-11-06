import { emailError, passwordRules, passwordStrength, uid } from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { FormError, StepFrame, Submit, TextLink, Title, useStepForm, type FlowForm } from './kit'
import { SsoButtons, type SsoProvider } from './Sso'
import '../styles'
import '@weft-js/warp-core/styles/flows/auth.css'
import '@weft-js/warp-core/styles/components/meter.css'
import '@weft-js/warp-core/styles/inputs/pickers.css' // the rules list

/** Strength Meter (05) and the rules list (03) under a new password. Each rule says itself: the colour is never alone. */
export function PasswordMeter({ value }: { value: string }) {
  const s = derived(() => passwordStrength(value))
  const rules = derived(() => passwordRules(value))
  return (
    <>
      <div
        data-scope="meter"
        data-level={
          s.value.tone === 'critical' ? 'full' : s.value.tone === 'caution' ? 'high' : undefined
        }
        role="meter"
        aria-label="Password strength"
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow={s.value.score}
        aria-valuetext={s.value.label}
        style={`--_v:${s.value.score / 4}`}
      >
        <div data-part="label-row">
          <span>Password strength</span>
          <span>{value ? s.value.label : ''}</span>
        </div>
        <div data-part="track">
          <div data-part="range"></div>
        </div>
      </div>
      <ul data-scope="rules">
        {rules.value.map((r) => (
          <li key={r.id} data-met={r.met ? '' : undefined}>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path pathLength="1" d="M2 6.5 5 9.5 10 3" />
            </svg>
            {r.label}
            <span data-part="sr-only">{r.met ? ', met' : ', not met'}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** What the sign-up form submits. */
export interface SignUpValues {
  name: string
  email: string
  password: string
  terms?: string
}

/** Props for SignUp. */
export interface SignUpProps extends FlowForm<SignUpValues> {
  title?: unknown
  lede?: unknown
  submitLabel?: unknown
  /** The terms checkbox's text, links included. */
  terms?: unknown
  providers?: SsoProvider[]
  onProvider?: ((id: string) => unknown) | undefined
  onSignIn?: () => void
}

/** Sign up (09 §2.1): name, email, password with strength and rules, terms; Create account is the one solid. */
export function SignUp(p: SignUpProps) {
  const id = uid('signup')
  const password = state('')
  const ctl = useStepForm<SignUpValues>(
    untrack(() => p),
    (v) => ({
      name: v.name ? undefined : 'Enter your name.',
      email: v.email ? emailError(v.email) : 'Enter your work email.',
      password: passwordRules(v.password!).every((r) => r.met)
        ? undefined
        : 'Use at least 8 characters, with a letter and a number.',
      terms: p.terms === undefined || v.terms ? undefined : 'Accept the terms to continue.',
    }),
  )
  return (
    <StepFrame ctl={ctl} embedded={!!p.form} labelledby={`${id}-t`}>
      <div>
        <Title as={p.heading} id={`${id}-t`}>
          {p.title ?? 'Create your account'}
        </Title>
        {p.lede !== undefined && <p data-part="lede">{p.lede}</p>}
      </div>
      {!!p.providers?.length && <SsoButtons providers={p.providers} onProvider={p.onProvider} />}
      {!!p.providers?.length && <div data-part="divider">or with email</div>}
      <FormError ctl={ctl} />
      <Input
        label="Your name"
        name="name"
        autocomplete="name"
        hint=""
        error={ctl.errors.value.name}
      />
      <Input
        label="Work email"
        name="email"
        type="email"
        inputmode="email"
        autocomplete="email"
        hint=""
        error={ctl.errors.value.email}
        onBlur={(e: FocusEvent) =>
          ctl.flag('email', emailError((e.target as HTMLInputElement).value))
        }
      />
      <div>
        <Input
          label="Password"
          name="password"
          type="password"
          autocomplete="new-password"
          hint=""
          error={ctl.errors.value.password}
          onInput={(e) => (password.value = e.currentTarget.value)}
        />
        <PasswordMeter value={password.value} />
      </div>
      {p.terms !== undefined && (
        <Checkbox
          name="terms"
          value="yes"
          hint={ctl.errors.value.terms ?? ''}
          error={ctl.errors.value.terms}
        >
          {p.terms}
        </Checkbox>
      )}
      <Submit ctl={ctl}>{p.submitLabel ?? 'Create account'}</Submit>
      {p.onSignIn && (
        <p data-part="fine">
          <TextLink onClick={p.onSignIn}>I already have an account</TextLink>
        </p>
      )}
    </StepFrame>
  )
}
