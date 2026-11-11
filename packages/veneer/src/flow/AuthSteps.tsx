import { KeyIcon, LeftIcon, MailIcon } from '@kerf-js/veneer-icons'
import { clockLabel, emailError, passwordRules, uid } from '@kerf-js/veneer-core'
import { derived, onCleanup, onMount, state, untrack } from '@kerf-js/core'
import { Avatar } from '../parts'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Input } from '../Field'
import {
  FormError,
  Mark,
  Rail,
  StepFrame,
  Submit,
  TextLink,
  Title,
  useCooldown,
  useStepForm,
  type FlowForm,
  type Heading,
} from './kit'
import { PasswordMeter } from './SignUp'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/auth.css'
import '@kerf-js/veneer-core/styles/layout/row.css'

const Back = ({ onBack }: { onBack: () => void }) => (
  <div>
    <Button emphasis="ghost" tone="neutral" size="sm" icon={LeftIcon} onClick={onBack}>
      Back
    </Button>
  </div>
)

/** "Check your inbox" (09 §2.1): waiting, so no solid; the address, Open mail app, resend on a countdown, change email. */
export function MagicLinkSent({
  email,
  title,
  lede,
  heading,
  resendIn = 30,
  mailHref,
  onResend,
  onChangeEmail,
  onBack,
}: {
  email: string
  title?: unknown
  lede?: unknown
  heading?: Heading
  resendIn?: number
  /** Shows Open email app (phones). */ mailHref?: string
  onResend?: () => void
  onChangeEmail?: () => void
  onBack?: () => void
}) {
  const round = state(0)
  const left = useCooldown(() => (round.value, resendIn))
  return (
    <div data-scope="stack">
      {onBack && <Back onBack={onBack} />}
      <Mark>
        <MailIcon />
      </Mark>
      <div>
        <Title as={heading}>{title ?? 'Check your inbox'}</Title>
        <p data-part="lede">
          {lede ?? (
            <>
              We sent a sign-in link to <b>{email}</b>. It works once and expires in 15 minutes.
            </>
          )}
        </p>
      </div>
      {mailHref && (
        <Button emphasis="frame" full role="link" onClick={() => location.assign(mailHref)}>
          Open email app
        </Button>
      )}
      <div data-part="row">
        {onResend && (
          <TextLink
            disabled={left.value > 0}
            onClick={() => {
              onResend()
              round.value++
            }}
          >
            {left.value > 0 ? `Resend in ${clockLabel(left.value)}` : 'Resend link'}
          </TextLink>
        )}
        {onChangeEmail && <TextLink onClick={onChangeEmail}>Use a different email</TextLink>}
      </div>
    </div>
  )
}

/** What the reset form collects, across its two steps. */
export interface ResetValues {
  email?: string
  password?: string
  confirm?: string
}

/** Props for ResetPassword. */
export interface ResetPasswordProps extends FlowForm<ResetValues> {
  /** `request` asks for the email; `password` sets the new one (after the link or the code). */
  stage?: 'request' | 'password' | undefined
  onBack?: () => void
  title?: unknown
  lede?: unknown
}

/** Reset (09 §2.1): email → link or code → new password and confirm. Never says whether the email has an account (§2.3). */
export function ResetPassword(p: ResetPasswordProps) {
  const id = uid('reset')
  const stage = untrack(() => p.stage ?? 'request')
  const password = state('')
  const ctl = useStepForm<ResetValues>(
    untrack(() => p),
    (v) =>
      stage === 'request'
        ? { email: v.email ? emailError(v.email) : 'Enter the email you sign in with.' }
        : {
            password: passwordRules(v.password ?? '').every((r) => r.met)
              ? undefined
              : 'Use at least 8 characters, with a letter and a number.',
            confirm: v.confirm === v.password ? undefined : "Those passwords don't match.",
          },
  )
  return (
    <StepFrame ctl={ctl} embedded={!!p.form} labelledby={`${id}-t`}>
      {p.onBack && <Back onBack={p.onBack} />}
      <Mark>
        <KeyIcon />
      </Mark>
      <div>
        <Title as={p.heading} id={`${id}-t`}>
          {p.title ?? (stage === 'request' ? 'Reset your password' : 'Choose a new password')}
        </Title>
        <p data-part="lede">
          {p.lede ??
            (stage === 'request'
              ? "We'll email a link that lets you choose a new one. It expires in 30 minutes."
              : 'Then sign in with it everywhere.')}
        </p>
      </div>
      <FormError ctl={ctl} />
      {stage === 'request' ? (
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
      ) : (
        <>
          <div>
            <Input
              label="New password"
              name="password"
              type="password"
              autocomplete="new-password"
              hint=""
              error={ctl.errors.value.password}
              onInput={(e) => (password.value = e.currentTarget.value)}
            />
            <PasswordMeter value={password.value} />
          </div>
          <Input
            label="Confirm password"
            name="confirm"
            type="password"
            autocomplete="new-password"
            hint=""
            error={ctl.errors.value.confirm}
          />
        </>
      )}
      <Submit ctl={ctl}>{stage === 'request' ? 'Send reset link' : 'Continue'}</Submit>
    </StepFrame>
  )
}

/** Invite accept (09 §2.1): who invited you, the org and role, "You'll join as…", Join and Decline; `children` holds an inline sign-in or sign-up. */
export function InviteAccept({
  inviter,
  org,
  role,
  email,
  description,
  heading,
  pending,
  onAccept,
  onDecline,
  onOtherAccount,
  onBack,
  children,
}: {
  inviter: string
  org: string
  role?: string
  email?: unknown
  description?: unknown
  heading?: Heading
  pending?: boolean | undefined
  onAccept?: () => void
  onDecline?: () => void
  onOtherAccount?: () => void
  onBack?: () => void
  children?: unknown
}) {
  const body = derived(() => children)
  return (
    <div data-scope="stack">
      {onBack && <Back onBack={onBack} />}
      <div data-scope="row" data-wrap="none">
        <Avatar name={inviter} size="lg" />
        <div>
          <p data-part="lede">{inviter} invited you to</p>
          <b>{org}</b> {role && <Badge tone="info">{role}</Badge>}
        </div>
      </div>
      <div>
        <Title as={heading}>Join {org}</Title>
        {email !== undefined && (
          <p data-part="lede">
            You'll join as <b>{email}</b>. {description}
          </p>
        )}
      </div>
      {body.value !== undefined ? (
        body.value
      ) : (
        <Button size="lg" full loading={pending} onClick={onAccept}>
          Join {org}
        </Button>
      )}
      <div data-part="row">
        {onOtherAccount && (
          <TextLink onClick={onOtherAccount}>Sign in with another account</TextLink>
        )}
        {onDecline && (
          <Button emphasis="ghost" tone="neutral" size="sm" onClick={onDecline}>
            Decline
          </Button>
        )}
      </div>
    </div>
  )
}

/** Done (09 §2.1): the mark strokes in, then the flow continues after `delay` (at once under reduced motion). */
export function AuthDone({
  title,
  lede,
  heading,
  delay = 1200,
  onContinue,
}: {
  title?: unknown
  lede?: unknown
  heading?: Heading
  delay?: number
  onContinue?: (() => void) | undefined
}) {
  onMount(() => {
    const reduced =
      matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
      document.documentElement.dataset.motion === 'reduce'
    const t = setTimeout(() => onContinue?.(), reduced ? 0 : untrack(() => delay))
    onCleanup(() => clearTimeout(t))
  })
  return (
    <div data-scope="stack">
      <Mark tone="positive" draw />
      <div>
        <Title as={heading}>{title ?? "You're in"}</Title>
        {lede !== undefined && <p data-part="lede">{lede}</p>}
      </div>
      <div data-scope="row">
        <Rail value={100} aria-hidden="true" />
      </div>
      {onContinue && (
        <Button full size="lg" onClick={onContinue}>
          Continue
        </Button>
      )}
    </div>
  )
}
