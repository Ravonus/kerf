import { emailError, uid } from '@weft/warp-core'
import { derived, untrack } from 'weft'
import { Input } from '../Field'
import { Switch } from '../Choice'
import { AuthLogo } from './AuthScreen'
import { FormError, StepFrame, Submit, TextLink, Title, useStepForm, type FlowForm } from './kit'
import { PasskeyButton, SsoButtons, type SsoProvider } from './Sso'
import '../styles'
import '@weft/warp-core/styles/flows/auth.css'
import '@weft/warp-core/styles/flows/sso.css'

export interface SignInValues { email: string; password: string; remember?: string }

export interface SignInProps extends FlowForm<SignInValues> {
  title?: any
  lede?: any
  logo?: any
  name?: any
  submitLabel?: any
  providers?: SsoProvider[]
  onProvider?: (id: string) => unknown
  /** Shows the passkey button; run WebAuthn here. */
  onPasskey?: () => unknown
  onForgot?: () => void
  /** Called with the typed email; asks for one first. */
  onMagicLink?: (email: string) => void
  onSignUp?: () => void
  onInvite?: () => void
  /** The "Keep me signed in" switch (default on). */
  remember?: boolean
}

/**
 * Sign in (09 §2.1): passkey and SSO frames, the divider, email and password, remember and Forgot, the one solid.
 * The email carries `username webauthn`, so conditional UI offers passkeys from first focus. A wrong password and an
 * unknown email read the same (§2.3).
 */
export function SignIn(p: SignInProps) {
  const id = uid('signin')
  const ctl = useStepForm<SignInValues>(untrack(() => p), v => ({ email: v.email ? emailError(v.email) : 'Enter your work email.', password: v.password ? undefined : 'Enter your password.' }))
  const hasSso = derived(() => !!(p.onPasskey || p.providers?.length))
  const ask = (e: MouseEvent) => {
    const scope = (e.currentTarget as HTMLElement).closest('form, [role="group"]')
    const email = scope?.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? ''
    const bad = email ? emailError(email) : "Enter your email first; we'll send the link there."
    ctl.flag('email', bad)
    if (!bad) p.onMagicLink?.(email)
  }
  return (
    <StepFrame ctl={ctl} embedded={!!p.form} labelledby={`${id}-t`}>
      {(p.logo !== undefined || p.name !== undefined) && <div><AuthLogo logo={p.logo} name={p.name} /></div>}
      <div><Title as={p.heading} id={`${id}-t`}>{p.title ?? 'Sign in'}</Title>{p.lede !== undefined && <p data-part="lede">{p.lede}</p>}</div>
      {hasSso.value && (
        <div data-scope="sso">
          {p.onPasskey && <PasskeyButton onPasskey={p.onPasskey} />}
          {p.providers?.length && <SsoButtons providers={p.providers} onProvider={p.onProvider} />}
        </div>
      )}
      {hasSso.value && <div data-part="divider">or with email</div>}
      <FormError ctl={ctl} actions={p.onForgot && <TextLink onClick={p.onForgot}>Reset your password</TextLink>} />
      <Input label="Work email" name="email" type="email" autocomplete="username webauthn" inputmode="email" value={p.form?.value?.('email')} hint="" error={ctl.errors.value.email} onBlur={(e: FocusEvent) => ctl.flag('email', emailError((e.target as HTMLInputElement).value))} />
      <Input label="Password" name="password" type="password" autocomplete="current-password" hint="" error={ctl.errors.value.password} />
      <div data-part="row">
        <Switch size="sm" name="remember" checked={p.remember ?? true}>Keep me signed in</Switch>
        {p.onForgot && <TextLink onClick={p.onForgot}>Forgot password?</TextLink>}
      </div>
      <Submit ctl={ctl}>{p.submitLabel ?? 'Sign in'}</Submit>
      {p.onMagicLink && <p data-part="fine"><TextLink onClick={ask}>Email me a sign-in link instead</TextLink></p>}
      {(p.onSignUp || p.onInvite) && (
        <p data-part="fine">
          {p.onSignUp && <TextLink onClick={p.onSignUp}>Create an account</TextLink>}
          {p.onSignUp && p.onInvite && ' · '}
          {p.onInvite && <TextLink onClick={p.onInvite}>Have an invite?</TextLink>}
        </p>
      )}
    </StepFrame>
  )
}
