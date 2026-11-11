// The flow pack driven as a user: keyboard paths, states, error paths, focus moves, announcements.
import { fireEvent } from '@testing-library/dom'
import { shortcuts } from '@kerf/veneer-core'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { AuthDone, InviteAccept, MagicLinkSent, ResetPassword } from '../src/flow/AuthSteps'
import { Checklist } from '../src/flow/Checklist'
import { ConnBanner, RateLimited } from '../src/flow/ConnBanner'
import { MfaSetup } from '../src/flow/MfaSetup'
import { OtpStep } from '../src/flow/Otp'
import { ReauthDialog } from '../src/flow/ReauthDialog'
import { ShortcutsOverlay } from '../src/flow/ShortcutsOverlay'
import { SignGate, SignGateBadge } from '../src/flow/SignGate'
import { SignUp } from '../src/flow/SignUp'
import { PasskeyButton, SsoButtons } from '../src/flow/Sso'
import { Toaster } from '../src/Toast'
import { button, said, type, named, tick } from './flow-support'
import {
  registerFlow,
  registerSignIn,
  registerOtpField,
  registerTour,
  registerSystemPage,
} from './flow-groups'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  history.replaceState(null, '', '/')
})

registerFlow()

registerSignIn()

test('a cancelled passkey sheet shows nothing; a real failure reaches onError; pending until settled', async () => {
  const onError = vi.fn()
  let fail: (e: unknown) => void = () => {}
  const { container: c } = render(() => (
    <PasskeyButton
      onError={onError}
      onPasskey={() =>
        new Promise((_, no) => {
          fail = no
        })
      }
    />
  ))
  const b = c.querySelector('button')!
  b.click()
  await flush()
  expect(b.getAttribute('aria-busy')).toBe('true')
  fail(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
  expect(onError).not.toHaveBeenCalled()
  expect(b.hasAttribute('aria-busy')).toBe(false)
  b.click()
  await flush()
  const boom = new Error('boom')
  fail(boom)
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
  expect(onError).toHaveBeenCalledWith(boom)
})

test('an SSO button stays pending until the redirect', async () => {
  const seen: string[] = []
  const { container: c } = render(() => (
    <SsoButtons
      providers={[
        { id: 'g', label: 'Google', glyph: 'M1 1' },
        { id: 's', label: 'SAML', name: 'single sign-on' },
      ]}
      onProvider={(id) => {
        seen.push(id)
        return new Promise(() => {})
      }}
    />
  ))
  const b = button(c, /SAML/)
  b.click()
  await flush()
  expect(seen).toEqual(['s'])
  expect(b.getAttribute('aria-busy')).toBe('true')
})

test('SignUp: the meter and rules follow the password, and it checks the rest', async () => {
  const onSubmit = vi.fn()
  const { container: c } = render(() => <SignUp onSubmit={onSubmit} terms="I agree" />)
  const meter = c.querySelector('[role="meter"]')!
  type(named(c, 'password'), 'abc')
  await flush()
  expect(meter.getAttribute('aria-valuetext')).toBe('Too short')
  expect(meter.getAttribute('data-level')).toBe('full')
  type(named(c, 'password'), 'Abcdefg1x')
  await flush()
  expect(meter.getAttribute('aria-valuetext')).toBe('Fair')
  expect(c.querySelectorAll('[data-scope="rules"] li[data-met]').length).toBe(3)
  named(c, 'name').value = 'Ada'
  named(c, 'email').value = 'a@b.co'
  fireEvent.submit(c.querySelector('form')!)
  await flush()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(c.textContent).toContain('Accept the terms')
  named(c, 'terms').click()
  fireEvent.submit(c.querySelector('form')!)
  await flush()
  expect(onSubmit).toHaveBeenCalledOnce()
})

registerOtpField()

test('OtpStep: Verify waits for all the digits; resend counts down and restarts; a WRONG_CODE lands on the field', async () => {
  vi.useFakeTimers()
  const onResend = vi.fn()
  const error = state<unknown>(undefined)
  const { container: c } = render(() => (
    <OtpStep resendIn={2} onResend={onResend} error={error.value} />
  ))
  await tick(0)
  const verify = c.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const resend = button(c, /Resend/)
  expect(verify.disabled).toBe(true)
  expect(resend.textContent).toBe('Resend in 0:02')
  expect(resend.disabled).toBe(true)
  await tick(2000)
  expect(resend.textContent).toBe('Resend code')
  resend.click()
  await tick(0)
  expect(onResend).toHaveBeenCalledOnce()
  expect(resend.textContent).toBe('Resend in 0:02')
  const input = c.querySelector('input')!
  input.value = '12345'
  fireEvent.input(input)
  await tick(0)
  expect(verify.disabled).toBe(true)
  error.value = { code: 'WRONG_CODE', data: { attemptsLeft: 2 } }
  await tick(0)
  expect(c.querySelector('[data-scope="otp"]')!.hasAttribute('data-invalid')).toBe(true)
  expect(c.textContent).toContain('2 tries left')
})

test('the waiting and reset steps', async () => {
  const resend = vi.fn(),
    other = vi.fn()
  const { container: c } = render(() => (
    <MagicLinkSent email="ada@a.co" resendIn={0} onResend={resend} onChangeEmail={other} />
  ))
  await flush()
  expect(c.textContent).toContain('ada@a.co')
  expect(c.querySelector('button[type="submit"]')).toBeNull()
  button(c, 'Resend link').click()
  button(c, 'Use a different email').click()
  expect(resend).toHaveBeenCalledOnce()
  expect(other).toHaveBeenCalledOnce()
  const onSubmit = vi.fn()
  const { container: r } = render(() => <ResetPassword stage="password" onSubmit={onSubmit} />)
  named(r, 'password').value = 'abcdefg1'
  named(r, 'confirm').value = 'nope'
  fireEvent.submit(r.querySelector('form')!)
  await flush()
  expect(r.textContent).toContain("Those passwords don't match.")
  expect(document.activeElement).toBe(named(r, 'confirm'))
  named(r, 'confirm').value = 'abcdefg1'
  fireEvent.submit(r.querySelector('form')!)
  await flush()
  expect(onSubmit).toHaveBeenCalledOnce()
})

test('InviteAccept: Join is the solid; a body replaces it; AuthDone continues by itself', async () => {
  vi.useFakeTimers()
  const accept = vi.fn(),
    go = vi.fn()
  const { container: c } = render(() => (
    <InviteAccept
      inviter="Noor Baptiste"
      org="Fieldwork"
      role="Editor"
      email="ada@a.co"
      onAccept={accept}
    />
  ))
  button(c, 'Join Fieldwork').click()
  expect(accept).toHaveBeenCalledOnce()
  const { container: b } = render(() => (
    <InviteAccept inviter="Noor" org="Fieldwork">
      <p>Sign in here</p>
    </InviteAccept>
  ))
  expect(b.textContent).toContain('Sign in here')
  expect(b.querySelector('button')).toBeNull()
  render(() => <AuthDone delay={1200} onContinue={go} />)
  await tick(1100)
  expect(go).not.toHaveBeenCalled()
  await tick(200)
  expect(go).toHaveBeenCalledOnce()
})

test('ReauthDialog: password or passkey, with the failure at the top', async () => {
  const open = state(true),
    confirm = vi.fn(),
    error = state<unknown>(undefined)
  const { container: c } = render(() => (
    <ReauthDialog
      open={open}
      reason="Deleting needs your password."
      onConfirm={confirm}
      onPasskey={() => {}}
      error={error.value}
    />
  ))
  await flush()
  const form = c.querySelector('form')!
  const submit = c.querySelector('button[type="submit"]')!
  expect(submit.getAttribute('form')).toBe(form.id)
  fireEvent.submit(form)
  await flush()
  expect(confirm).not.toHaveBeenCalled()
  named(c, 'password').value = 'secret'
  fireEvent.submit(form)
  await flush()
  expect(confirm).toHaveBeenCalledWith('secret')
  expect(button(c, 'Use a passkey')).toBeTruthy()
  error.value = "That password doesn't match."
  await flush()
  expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain("doesn't match")
})

test('MfaSetup: scan, verify (wrong, then right), codes; Finish waits for the ack', async () => {
  const open = state(true),
    done = vi.fn()
  const verify = vi.fn((code: string) => code === '123456')
  const { container: c } = render(() => (
    <MfaSetup
      open={open}
      qr={<i>QR</i>}
      secret="JBSW"
      codes={['AA-1', 'BB-2']}
      onVerify={verify}
      onDone={done}
    />
  ))
  await flush()
  expect(c.textContent).toContain('JBSW')
  const next = () => button(c, /Continue|Finish/)
  next().click()
  await flush()
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
  expect(c.textContent).toContain('Step 2 of 3')
  const code = named(c, 'totp')
  next().click()
  await flush()
  expect(verify).not.toHaveBeenCalled()
  expect(c.textContent).toContain('Enter the 6 digits')
  type(code, '000000')
  next().click()
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
  expect(c.textContent).toContain("didn't match")
  type(code, '123456')
  next().click()
  await new Promise((r) => {
    setTimeout(r)
  })
  await flush()
  expect(c.querySelectorAll('[data-part="codes"] li').length).toBe(2)
  expect(next().textContent).toContain('Finish')
  expect(next().disabled).toBe(true)
  c.querySelector<HTMLInputElement>('[data-step="codes"] input[type="checkbox"]')!.click()
  await flush()
  next().click()
  await flush()
  expect(done).toHaveBeenCalledOnce()
  expect(open.value).toBe(false)
})

describe('SignGate', () => {
  test('inert behind a non-modal region until signed; then the page, once', async () => {
    vi.useFakeTimers()
    const status = state<Parameters<typeof SignGate>[0]['status']>('unsigned'),
      signed = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SignGateBadge status={status.value} />
        <SignGate
          status={status.value}
          src="about:blank"
          title="Sign the agreement"
          onSigned={signed}
        >
          <button>Create key</button>
        </SignGate>
      </>
    ))
    await tick(0)
    const content = c.querySelector('[data-part="content"]')!
    const blocker = c.querySelector('[data-part="blocker"]')!
    expect(content.hasAttribute('inert')).toBe(true)
    expect(blocker.tagName).toBe('SECTION')
    expect(blocker.getAttribute('role')).toBeNull()
    expect(blocker.getAttribute('aria-labelledby')).toBe(c.querySelector('h4')!.id)
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe('caution')
    status.value = 'pending'
    await tick(100)
    expect(said()).toContain('Signature pending')
    status.value = 'signed'
    await tick(0)
    expect(content.hasAttribute('inert')).toBe(false)
    expect(c.querySelector('[data-part="blocker"]')).toBeNull()
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe('positive')
    expect(signed).toHaveBeenCalledOnce()
  })
  test('the signer: inline on a wide screen, in a Sheet on a phone', async () => {
    const { container: c } = render(() => (
      <SignGate status="unsigned" src="about:blank" title="Sign" />
    ))
    button(c, 'Review and sign').click()
    await flush()
    const frame = c.querySelector('[data-part="blocker"] iframe')!
    expect(frame.getAttribute('height')).toBe('560')
    expect(frame.getAttribute('title')).toContain('Signer')
    const was = innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { container: p } = render(() => (
      <SignGate status="unsigned" src="about:blank" title="Sign" />
    ))
    await flush()
    button(p, 'Review and sign').click()
    await flush()
    expect(p.querySelector('[data-part="blocker"] iframe')).toBeNull()
    expect(p.querySelector('dialog iframe')).not.toBeNull()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: was })
  })
  test.each([
    ['expired', 'Resend', 'critical'],
    ['declined', 'Resend', 'critical'],
    ['error', 'Retry', 'neutral'],
  ] as const)('%s has one action', (status, action, tone) => {
    const act = vi.fn()
    const { container: c } = render(() => (
      <>
        <SignGateBadge status={status} />
        <SignGate status={status} title="Sign" onResend={act} onRetry={act} />
      </>
    ))
    expect(c.querySelector('iframe')).toBeNull()
    button(c, action).click()
    expect(act).toHaveBeenCalledOnce()
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe(tone)
  })
})

test('Checklist: the counter and rail follow the items, a completion is said once, then Hide offers Undo', async () => {
  vi.useFakeTimers()
  const items = state([
    { id: 'a', title: 'One', done: true },
    { id: 'b', title: 'Two', action: { label: 'Do it', onClick() {} } },
  ])
  const undo = vi.fn()
  const { container: c } = render(() => (
    <>
      <Toaster />
      <Checklist items={items.value} onHide={() => {}} onUndoHide={undo} />
    </>
  ))
  await tick(0)
  const root = c.querySelector<HTMLElement>('[data-scope="checklist"]')!
  expect(c.querySelector('[data-scope="checklist"] [data-part="title"]')!.textContent).toContain(
    '1 of 2',
  )
  const rail = c.querySelector('[role="progressbar"]')!
  expect(rail.getAttribute('aria-valuenow')).toBe('1')
  expect(c.querySelector('[data-part="item"]')!.textContent).toContain(', done')
  expect(c.querySelectorAll('[data-part="item"]')[1]!.textContent).toContain(', to do')
  expect(c.querySelector<HTMLInputElement>('[data-part="item"] input')!.disabled).toBe(true) // from server state, not clicks
  items.value = items.value.map((i) => ({ ...i, done: true })) as typeof items.value
  await tick(100)
  expect(root.dataset.state).toBe('complete')
  expect(said()).toBe('All set up.')
  button(c, 'Hide checklist').click()
  await tick(0)
  expect(root.hidden).toBe(true)
  button(c.querySelector('[data-scope="toast"][data-part="root"]')!, 'Undo').click()
  await tick(0)
  expect(root.hidden).toBe(false)
  expect(undo).toHaveBeenCalledOnce()
})

registerTour()

registerSystemPage()

describe('ConnBanner', () => {
  test('offline, reconnecting, back online for 3s; assertive once, then polite once', async () => {
    vi.useFakeTimers()
    const online = state(false),
      st = state<string>('offline'),
      retry = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <ConnBanner online={online} state={st} retryIn={4} onRetry={retry} changes={2} />
      </>
    ))
    await tick(100)
    const conn = () => c.querySelector<HTMLElement>('[data-scope="conn"]')
    expect(conn()!.dataset.state).toBe('offline')
    expect(conn()!.textContent).toContain('Retrying in 4s')
    expect(conn()!.hasAttribute('role')).toBe(false) // the ticking text never reads out
    expect(
      document.querySelector('[data-scope="announcer"][aria-live="assertive"]')!.textContent,
    ).toContain("You're offline")
    await tick(1000)
    expect(conn()!.textContent).toContain('Retrying in 3s')
    button(c, 'Retry now').click()
    expect(retry).toHaveBeenCalledOnce()
    online.value = true
    st.value = 'reconnecting'
    await tick(0)
    expect(conn()!.dataset.state).toBe('reconnecting')
    expect(conn()!.textContent).toContain('Sending 2 changes.')
    st.value = 'live'
    await tick(100)
    expect(conn()!.dataset.state).toBe('online')
    expect(conn()!.textContent).toContain('2 changes synced.')
    expect(
      document.querySelector('[data-scope="announcer"][aria-live="polite"]')!.textContent,
    ).toContain('Back online')
    await tick(3100)
    expect(conn()).toBeNull()
  })
  test('takes the online() factory', async () => {
    const live = state(false)
    const { container: c } = render(() => <ConnBanner online={() => live} />)
    await flush()
    expect(c.querySelector('[data-scope="conn"]')).not.toBeNull()
    live.value = true
    await flush()
    expect(c.querySelector<HTMLElement>('[data-scope="conn"]')!.dataset.state).toBe('online')
  })
  test('stale: Reload runs, Later hides it for 30 minutes, a failed contract turns it caution', async () => {
    vi.useFakeTimers()
    const reload = vi.fn(),
      failed = state(false)
    const { container: c } = render(() => (
      <>
        <Toaster />
        <ConnBanner stale name="Fieldwork" onReload={reload} contractFailed={failed.value} />
      </>
    ))
    await tick(100)
    const conn = () => c.querySelector<HTMLElement>('[data-scope="conn"]')
    expect(conn()!.dataset.state).toBe('stale')
    expect(conn()!.textContent).toContain('A new version of Fieldwork is ready.')
    button(c, 'Reload').click()
    expect(reload).toHaveBeenCalledOnce()
    failed.value = true
    await tick(0)
    expect(conn()!.dataset.state).toBe('limited')
    expect(conn()!.textContent).toContain('Reload to finish saving.')
    button(c, 'Later').click()
    await tick(0)
    expect(conn()).toBeNull()
    await tick(30 * 60 * 1000 + 10)
    expect(conn()).not.toBeNull()
  })
})

test('RateLimited: counts down in place, the trigger says why, and comes back by itself', async () => {
  vi.useFakeTimers()
  const press = vi.fn(),
    done = vi.fn()
  const { container: c } = render(() => (
    <>
      <Toaster />
      <RateLimited
        retryAfter={2}
        title="Export limit reached."
        description="You can run 5 exports a minute."
        trigger={{ children: 'Export CSV', onClick: press }}
        onDone={done}
      />
    </>
  ))
  await tick(100)
  expect(said()).toBe('Export limit reached. Try again in 2s.')
  const trigger = c.querySelector<HTMLButtonElement>('[data-scope="conn"] ~ div button')!
  expect(trigger.disabled).toBe(true)
  expect(trigger.textContent).toBe('Try again in 2s')
  expect(c.querySelector('[data-scope="conn"]')!.textContent).toContain('Try again in 2s.')
  await tick(1000)
  expect(
    c
      .querySelector<HTMLElement>('[data-scope="conn"] [data-part="rail-fill"]')!
      .style.getPropertyValue('--p'),
  ).toBe('0.5')
  await tick(1100)
  expect(c.querySelector('[data-scope="conn"]')).toBeNull()
  expect(trigger.disabled).toBe(false)
  expect(trigger.textContent).toBe('Export CSV')
  expect(done).toHaveBeenCalledOnce()
  expect(said()).toBe('You can try again now.')
})

describe('ShortcutsOverlay', () => {
  const key = (
    k: string,
    target: Element | Document = document.body,
    init: KeyboardEventInit = {},
  ) => fireEvent.keyDown(target, { key: k, ...init })
  test('? opens it outside a text field, never inside; turned off, it stays shut', async () => {
    const open = state(false)
    const { container: c } = render(() => (
      <>
        <input id="t" />
        <ShortcutsOverlay open={open} />
      </>
    ))
    await flush()
    key('?', c.querySelector('#t')!)
    await flush()
    expect(open.value).toBe(false)
    shortcuts.singleKeys = false
    key('?')
    await flush()
    expect(open.value).toBe(false)
    shortcuts.singleKeys = true
    key('?')
    await flush()
    expect(open.value).toBe(true)
  })
  test('lists the registry by group, platform-aware, with a filter over names and keys', async () => {
    const drop = [
      shortcuts.register({ keys: 'mod+k', label: 'Search', group: 'Navigation' }),
      shortcuts.register({ keys: 'g m', label: 'Go to members', group: 'Navigation' }),
    ]
    const open = state(true)
    const { container: c } = render(() => <ShortcutsOverlay open={open} />)
    await flush()
    const shown = () =>
      [...c.querySelectorAll('[data-scope="shortcuts"] section')].map(
        (s) => s.querySelector('h4')!.textContent,
      )
    expect(shown()).toEqual(['Navigation', 'Help'])
    const row = [...c.querySelectorAll('dl > div')].find((d) =>
      d.textContent.includes('Go to members'),
    )!
    expect(row.querySelector('dd')!.textContent).toBe('G then M')
    expect(
      [...c.querySelectorAll('dl > div')]
        .find((d) => d.textContent.includes('Search'))!
        .querySelector('dd')!.textContent,
    ).toBe('CtrlK')
    const filter = c.querySelector<HTMLInputElement>('[data-scope="shortcuts"] input')!
    type(filter, 'memb')
    await flush()
    expect(c.querySelectorAll('dl > div').length).toBe(1)
    expect(c.querySelector('mark')!.textContent).toBe('memb')
    type(filter, 'zzz')
    await flush()
    expect(c.querySelector('[data-part="empty"]')!.textContent).toContain('zzz')
    drop.forEach((d) => d())
  })
})
