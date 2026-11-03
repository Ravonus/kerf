// The flow pack driven as a user: keyboard paths, states, error paths, focus moves, announcements.
import { fireEvent } from '@testing-library/dom'
import { shortcuts } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { AuthDone, InviteAccept, MagicLinkSent, ResetPassword } from '../src/flow/AuthSteps'
import { Checklist } from '../src/flow/Checklist'
import { ConnBanner, RateLimited } from '../src/flow/ConnBanner'
import { Flow } from '../src/flow/Flow'
import { MfaSetup } from '../src/flow/MfaSetup'
import { OtpField, OtpStep } from '../src/flow/Otp'
import { ReauthDialog } from '../src/flow/ReauthDialog'
import { ShortcutsOverlay } from '../src/flow/ShortcutsOverlay'
import { SignGate, SignGateBadge } from '../src/flow/SignGate'
import { SignIn } from '../src/flow/SignIn'
import { SignUp } from '../src/flow/SignUp'
import { PasskeyButton, SsoButtons } from '../src/flow/Sso'
import { SystemPage } from '../src/flow/SystemPage'
import { Coachmark, Tour } from '../src/flow/Tour'
import { Toaster } from '../src/Toast'

const button = (c: ParentNode, name: string | RegExp) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => (typeof name === 'string' ? (b.getAttribute('aria-label') ?? b.textContent) === name || b.querySelector('[data-part="sweep-label"]')?.textContent === name : name.test(b.textContent)))!
const said = () => [...document.querySelectorAll('[data-scope="announcer"]')].map(a => a.textContent).filter(Boolean).join(' | ')
const type = (i: HTMLInputElement, v: string) => { i.value = v; fireEvent.input(i) }
const named = (c: ParentNode, n: string) => c.querySelector<HTMLInputElement>(`input[name="${n}"]`)!
const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flush() }

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; history.replaceState(null, '', '/') })

describe('Flow', () => {
  const steps = [
    { id: 'a', label: 'Cart', render: () => <h2 data-part="step-title" tabindex="-1">Cart</h2> },
    { id: 'b', label: 'Shipping', render: () => <><h2 data-part="step-title" tabindex="-1">Shipping</h2><input /></> },
    { id: 'c', label: 'Pay', render: () => <input data-autofocus="" aria-label="Card" /> },
  ]
  test('moves forward and back: direction, states, title focus, polite step, content kept', async () => {
    vi.useFakeTimers()
    const step = state('a')
    const { container: c } = render(() => <><Toaster /><Flow step={step} steps={steps} /></>)
    await tick(0)
    const root = c.querySelector<HTMLElement>('[data-scope="flow"]')!
    const of = (id: string) => root.querySelector<HTMLElement>(`[data-step="${id}"]`)!
    expect(of('a').dataset.state).toBe('active')
    expect(of('b').children.length).toBe(0)
    step.value = 'b'
    await tick(0)
    expect(of('b').dataset.state).toBe('active')
    expect(of('a').dataset.state).toBeUndefined() // no animation in jsdom: the exit ends at once
    expect(document.activeElement).toBe(of('b').querySelector('h2'))
    expect(root.dataset.dir).toBe('forward')
    await tick(80)
    expect(said()).toBe('Step 2 of 3, Shipping')
    const input = of('b').querySelector('input')!
    input.value = 'kept'
    step.value = 'c'
    await tick(0)
    expect(document.activeElement).toBe(of('c').querySelector('input'))
    step.value = 'b'
    await tick(0)
    expect(root.dataset.dir).toBe('back')
    expect(of('b').querySelector('input')!.value).toBe('kept')
  })
  test('history: one entry a step; Back goes back a step; a URL opens its step', async () => {
    history.replaceState(null, '', '/?x=1')
    const push = vi.spyOn(history, 'pushState')
    const step = state('a')
    const seen: string[] = []
    const { container: c } = render(() => <Flow step={step} steps={steps} history onStepChange={v => seen.push(v)} />)
    await flush(); await Promise.resolve(); await flush()
    expect(location.search).toBe('?x=1&step=a')
    step.value = 'b'
    await flush(); await Promise.resolve(); await flush()
    expect(push).toHaveBeenCalledOnce()
    expect(location.search).toBe('?x=1&step=b')
    history.replaceState(null, '', '/?x=1&step=a')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flush(); await Promise.resolve(); await flush()
    expect(step.value).toBe('a')
    expect(push).toHaveBeenCalledOnce()
    expect(c.querySelector<HTMLElement>('[data-step="a"]')!.dataset.state).toBe('active')
    push.mockRestore()
  })
  test('a ?step= in the URL wins on load', async () => {
    history.replaceState(null, '', '/?step=b')
    const { container: c } = render(() => <Flow defaultStep="a" steps={steps} history="step" />)
    await flush(); await Promise.resolve(); await flush()
    expect(c.querySelector<HTMLElement>('[data-step="b"]')!.dataset.state).toBe('active')
  })
})

describe('SignIn', () => {
  test('checks its fields, focuses the first invalid, then submits the values', async () => {
    const onSubmit = vi.fn()
    const { container: c } = render(() => <SignIn onSubmit={onSubmit} />)
    const form = c.querySelector('form')!
    fireEvent.submit(form); await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(named(c, 'email'))
    expect(named(c, 'email').getAttribute('aria-invalid')).toBe('true')
    expect(c.textContent).toContain('Enter your work email.')
    named(c, 'email').value = 'ada@fieldwork.dev'; named(c, 'password').value = 'hunter22'
    fireEvent.submit(form); await flush()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ email: 'ada@fieldwork.dev', password: 'hunter22', remember: 'on' })
  })
  test('the email is checked on blur and offers passkeys from first focus', async () => {
    const { container: c } = render(() => <SignIn />)
    const email = named(c, 'email')
    expect(email.autocomplete).toBe('username webauthn')
    email.value = 'nope'; fireEvent.blur(email); await flush()
    expect(c.textContent).toContain("doesn't look like an email")
    email.value = 'a@b.co'; fireEvent.blur(email); await flush()
    expect(email.hasAttribute('aria-invalid')).toBe(false)
  })
  test('a domain error is one Alert, focused and assertive', async () => {
    const error = state<unknown>(undefined)
    const { container: c } = render(() => <SignIn error={error.value} onForgot={() => {}} />)
    await flush()
    error.value = { code: 'INVALID_CREDENTIALS' }
    await flush()
    const alert = c.querySelector('[data-scope="alert"]')!
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain("That email and password don't match.")
    expect(document.activeElement).toBe(c.querySelector('[data-part="formerr"]'))
  })
  test('RATE_LIMITED: a live countdown, submit disabled with the reason, back by itself', async () => {
    vi.useFakeTimers()
    const { container: c } = render(() => <><Toaster /><SignIn error={{ code: 'RATE_LIMITED', data: { retryAfter: 2 } }} /></>)
    await tick(0)
    const submit = c.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('Try again in 2s')
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain('Try again in 2s.')
    await tick(1000)
    expect(submit.textContent).toContain('Try again in 1s')
    await tick(1000)
    expect(submit.disabled).toBe(false)
    expect(submit.textContent).toContain('Sign in')
    await tick(80)
    expect(said()).toBe('You can try again now.')
  })
  test('a network failure is a toast with Retry; the values stay', async () => {
    const error = state<unknown>(undefined)
    const retry = vi.fn()
    const { container: c } = render(() => <><Toaster /><SignIn error={error.value} onRetry={retry} /></>)
    await flush()
    named(c, 'email').value = 'kept@a.co'
    error.value = { status: 503 }
    await flush()
    const t = c.querySelector('[data-scope="toast"][data-part="root"]')!
    expect(t.textContent).toContain("We couldn't reach the server.")
    expect(named(c, 'email').value).toBe('kept@a.co')
    button(t, 'Retry').click()
    expect(retry).toHaveBeenCalledOnce()
  })
  test('inside <Form of>: no second form; reads pending, errors and the message from it', async () => {
    const pending = state(false), errors = state<Record<string, string>>({}), message = state<string | undefined>(undefined)
    const form = { pending, errors, message, value: (n: string) => (n === 'email' ? 'back@a.co' : undefined) }
    const { container: c } = render(() => <form><SignIn form={form} /></form>)
    await flush()
    expect(c.querySelectorAll('form').length).toBe(1)
    expect(named(c, 'email').value).toBe('back@a.co')
    errors.value = { password: 'At least 8 characters' }
    await flush()
    expect(c.textContent).toContain('At least 8 characters')
    expect(document.activeElement).toBe(named(c, 'password'))
    message.value = 'Nope'
    await flush()
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain('Nope')
    pending.value = true
    await flush()
    expect(c.querySelector('button[type="submit"]')!.getAttribute('aria-busy')).toBe('true')
  })
  test('magic link asks for the email first', async () => {
    const onMagicLink = vi.fn()
    const { container: c } = render(() => <SignIn onMagicLink={onMagicLink} />)
    button(c, 'Email me a sign-in link instead').click(); await flush()
    expect(onMagicLink).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Enter your email first')
    named(c, 'email').value = 'a@b.co'
    button(c, 'Email me a sign-in link instead').click(); await flush()
    expect(onMagicLink).toHaveBeenCalledWith('a@b.co')
  })
})

test('a cancelled passkey sheet shows nothing; a real failure reaches onError; pending until settled', async () => {
  const onError = vi.fn()
  let fail: (e: unknown) => void = () => {}
  const { container: c } = render(() => <PasskeyButton onError={onError} onPasskey={() => new Promise((_, no) => { fail = no })} />)
  const b = c.querySelector('button')!
  b.click(); await flush()
  expect(b.getAttribute('aria-busy')).toBe('true')
  fail(Object.assign(new Error('no'), { name: 'NotAllowedError' })); await new Promise(r => { setTimeout(r) }); await flush()
  expect(onError).not.toHaveBeenCalled()
  expect(b.hasAttribute('aria-busy')).toBe(false)
  b.click(); await flush()
  const boom = new Error('boom')
  fail(boom); await new Promise(r => { setTimeout(r) }); await flush()
  expect(onError).toHaveBeenCalledWith(boom)
})

test('an SSO button stays pending until the redirect', async () => {
  const seen: string[] = []
  const { container: c } = render(() => <SsoButtons providers={[{ id: 'g', label: 'Google', glyph: 'M1 1' }, { id: 's', label: 'SAML', name: 'single sign-on' }]} onProvider={id => { seen.push(id); return new Promise(() => {}) }} />)
  const b = button(c, /SAML/)
  b.click(); await flush()
  expect(seen).toEqual(['s'])
  expect(b.getAttribute('aria-busy')).toBe('true')
})

test('SignUp: the meter and rules follow the password, and it checks the rest', async () => {
  const onSubmit = vi.fn()
  const { container: c } = render(() => <SignUp onSubmit={onSubmit} terms="I agree" />)
  const meter = c.querySelector('[role="meter"]')!
  type(named(c, 'password'), 'abc'); await flush()
  expect(meter.getAttribute('aria-valuetext')).toBe('Too short')
  expect(meter.getAttribute('data-level')).toBe('full')
  type(named(c, 'password'), 'Abcdefg1x'); await flush()
  expect(meter.getAttribute('aria-valuetext')).toBe('Fair')
  expect(c.querySelectorAll('[data-scope="rules"] li[data-met]').length).toBe(3)
  named(c, 'name').value = 'Ada'; named(c, 'email').value = 'a@b.co'
  fireEvent.submit(c.querySelector('form')!); await flush()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(c.textContent).toContain('Accept the terms')
  named(c, 'terms').click()
  fireEvent.submit(c.querySelector('form')!); await flush()
  expect(onSubmit).toHaveBeenCalledOnce()
})

describe('OtpField', () => {
  const chars = (c: ParentNode) => [...c.querySelectorAll('[data-part="char"]')].map(x => x.textContent).join('')
  const mount = async (node: () => unknown) => { const r = render(node); await flush(); await Promise.resolve(); return r }
  test('one input, six cells, a labelled tab stop', async () => {
    const { container: c } = await mount(() => <OtpField />)
    const input = c.querySelector('input')!
    expect(c.querySelectorAll('[data-part="cell"]').length).toBe(6)
    expect(c.querySelector('label')!.getAttribute('for')).toBe(input.id)
    expect(input.autocomplete).toBe('one-time-code')
    expect(input.inputMode).toBe('numeric')
    input.focus(); fireEvent.focus(input)
    expect(c.querySelectorAll('[data-part="cell"]')[0]!.hasAttribute('data-pin')).toBe(true)
  })
  test('digits only; the last digit completes and submits the form', async () => {
    const done = vi.fn()
    const submit = vi.fn((e: Event) => e.preventDefault())
    const { container: c } = await mount(() => <form onSubmit={submit}><OtpField onComplete={done} /></form>)
    const input = c.querySelector('input')!
    type(input, '1a2')
    expect(input.value).toBe('12')
    expect(chars(c)).toBe('12')
    type(input, '123456')
    expect(done).toHaveBeenCalledWith('123456')
    expect(submit).toHaveBeenCalledOnce()
  })
  test('a paste of the whole code, spaces and all, fills every cell', async () => {
    const done = vi.fn()
    const { container: c } = await mount(() => <OtpField autoSubmit={false} onComplete={done} />)
    const input = c.querySelector('input')!
    fireEvent.paste(input, { clipboardData: { getData: () => '123 456' } })
    expect(chars(c)).toBe('123456')
    expect(done).toHaveBeenCalledWith('123456')
  })
  test('a wrong code pins every cell, clears, refocuses; the message stays until the next key', async () => {
    const error = state<string | undefined>(undefined)
    const { container: c } = await mount(() => <OtpField error={error.value} autoSubmit={false} />)
    const input = c.querySelector('input')!, root = c.querySelector('[data-scope="otp"]')!
    type(input, '000000')
    error.value = "That code didn't work. 2 tries left."
    await flush(); await Promise.resolve(); await flush()
    expect(root.hasAttribute('data-invalid')).toBe(true)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(c.querySelectorAll('[data-part="cell"][data-pin]').length).toBe(6)
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('2 tries left')
    type(input, '1'); await flush()
    expect(root.hasAttribute('data-invalid')).toBe(false)
    expect(c.querySelector('[role="alert"]')).toBeNull()
  })
  test('success pins every cell for the cascade', async () => {
    const status = state<'idle' | 'success'>('idle')
    const { container: c } = await mount(() => <OtpField status={status.value} autoSubmit={false} />)
    status.value = 'success'
    await flush(); await Promise.resolve(); await flush()
    expect(c.querySelector<HTMLElement>('[data-scope="otp"]')!.dataset.state).toBe('success')
    expect(c.querySelectorAll('[data-part="cell"][data-pin]').length).toBe(6)
    expect(c.querySelectorAll<HTMLElement>('[data-part="cell"]')[5]!.style.getPropertyValue('--n')).toBe('5')
  })
})

test('OtpStep: Verify waits for all the digits; resend counts down and restarts; a WRONG_CODE lands on the field', async () => {
  vi.useFakeTimers()
  const onResend = vi.fn()
  const error = state<unknown>(undefined)
  const { container: c } = render(() => <OtpStep resendIn={2} onResend={onResend} error={error.value} />)
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
  input.value = '12345'; fireEvent.input(input); await tick(0)
  expect(verify.disabled).toBe(true)
  error.value = { code: 'WRONG_CODE', data: { attemptsLeft: 2 } }
  await tick(0)
  expect(c.querySelector('[data-scope="otp"]')!.hasAttribute('data-invalid')).toBe(true)
  expect(c.textContent).toContain('2 tries left')
})

test('the waiting and reset steps', async () => {
  const resend = vi.fn(), other = vi.fn()
  const { container: c } = render(() => <MagicLinkSent email="ada@a.co" resendIn={0} onResend={resend} onChangeEmail={other} />)
  await flush()
  expect(c.textContent).toContain('ada@a.co')
  expect(c.querySelector('button[type="submit"]')).toBeNull()
  button(c, 'Resend link').click(); button(c, 'Use a different email').click()
  expect(resend).toHaveBeenCalledOnce(); expect(other).toHaveBeenCalledOnce()
  const onSubmit = vi.fn()
  const { container: r } = render(() => <ResetPassword stage="password" onSubmit={onSubmit} />)
  named(r, 'password').value = 'abcdefg1'; named(r, 'confirm').value = 'nope'
  fireEvent.submit(r.querySelector('form')!); await flush()
  expect(r.textContent).toContain("Those passwords don't match.")
  expect(document.activeElement).toBe(named(r, 'confirm'))
  named(r, 'confirm').value = 'abcdefg1'
  fireEvent.submit(r.querySelector('form')!); await flush()
  expect(onSubmit).toHaveBeenCalledOnce()
})

test('InviteAccept: Join is the solid; a body replaces it; AuthDone continues by itself', async () => {
  vi.useFakeTimers()
  const accept = vi.fn(), go = vi.fn()
  const { container: c } = render(() => <InviteAccept inviter="Noor Baptiste" org="Fieldwork" role="Editor" email="ada@a.co" onAccept={accept} />)
  button(c, 'Join Fieldwork').click()
  expect(accept).toHaveBeenCalledOnce()
  const { container: b } = render(() => <InviteAccept inviter="Noor" org="Fieldwork"><p>Sign in here</p></InviteAccept>)
  expect(b.textContent).toContain('Sign in here')
  expect(b.querySelector('button')).toBeNull()
  render(() => <AuthDone delay={1200} onContinue={go} />)
  await tick(1100)
  expect(go).not.toHaveBeenCalled()
  await tick(200)
  expect(go).toHaveBeenCalledOnce()
})

test('ReauthDialog: password or passkey, with the failure at the top', async () => {
  const open = state(true), confirm = vi.fn(), error = state<unknown>(undefined)
  const { container: c } = render(() => <ReauthDialog open={open} reason="Deleting needs your password." onConfirm={confirm} onPasskey={() => {}} error={error.value} />)
  await flush()
  const form = c.querySelector('form')!
  const submit = c.querySelector('button[type="submit"]')!
  expect(submit.getAttribute('form')).toBe(form.id)
  fireEvent.submit(form); await flush()
  expect(confirm).not.toHaveBeenCalled()
  named(c, 'password').value = 'secret'
  fireEvent.submit(form); await flush()
  expect(confirm).toHaveBeenCalledWith('secret')
  expect(button(c, 'Use a passkey')).toBeTruthy()
  error.value = "That password doesn't match."
  await flush()
  expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain("doesn't match")
})

test('MfaSetup: scan, verify (wrong, then right), codes; Finish waits for the ack', async () => {
  const open = state(true), done = vi.fn()
  const verify = vi.fn((code: string) => code === '123456')
  const { container: c } = render(() => <MfaSetup open={open} qr={<i>QR</i>} secret="JBSW" codes={['AA-1', 'BB-2']} onVerify={verify} onDone={done} />)
  await flush()
  expect(c.textContent).toContain('JBSW')
  const next = () => button(c, /Continue|Finish/)
  next().click(); await flush(); await new Promise(r => { setTimeout(r) }); await flush()
  expect(c.textContent).toContain('Step 2 of 3')
  const code = named(c, 'totp')
  next().click(); await flush()
  expect(verify).not.toHaveBeenCalled()
  expect(c.textContent).toContain('Enter the 6 digits')
  type(code, '000000'); next().click(); await new Promise(r => { setTimeout(r) }); await flush()
  expect(c.textContent).toContain("didn't match")
  type(code, '123456'); next().click(); await new Promise(r => { setTimeout(r) }); await flush()
  expect(c.querySelectorAll('[data-part="codes"] li').length).toBe(2)
  expect(next().textContent).toContain('Finish')
  expect(next().disabled).toBe(true)
  c.querySelector<HTMLInputElement>('[data-step="codes"] input[type="checkbox"]')!.click(); await flush()
  next().click(); await flush()
  expect(done).toHaveBeenCalledOnce()
  expect(open.value).toBe(false)
})

describe('SignGate', () => {
  test('inert behind a non-modal region until signed; then the page, once', async () => {
    vi.useFakeTimers()
    const status = state<Parameters<typeof SignGate>[0]['status']>('unsigned'), signed = vi.fn()
    const { container: c } = render(() => <><Toaster /><SignGateBadge status={status.value} /><SignGate status={status.value} src="about:blank" title="Sign the agreement" onSigned={signed}><button>Create key</button></SignGate></>)
    await tick(0)
    const content = c.querySelector('[data-part="content"]')!
    const blocker = c.querySelector('[data-part="blocker"]')!
    expect(content.hasAttribute('inert')).toBe(true)
    expect(blocker.tagName).toBe('SECTION')
    expect(blocker.getAttribute('role')).toBeNull()
    expect(blocker.getAttribute('aria-labelledby')).toBe(c.querySelector('h4')!.id)
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe('caution')
    status.value = 'pending'; await tick(100)
    expect(said()).toContain('Signature pending')
    status.value = 'signed'; await tick(0)
    expect(content.hasAttribute('inert')).toBe(false)
    expect(c.querySelector('[data-part="blocker"]')).toBeNull()
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe('positive')
    expect(signed).toHaveBeenCalledOnce()
  })
  test('the signer: inline on a wide screen, in a Sheet on a phone', async () => {
    const { container: c } = render(() => <SignGate status="unsigned" src="about:blank" title="Sign" />)
    button(c, 'Review and sign').click(); await flush()
    const frame = c.querySelector('[data-part="blocker"] iframe')!
    expect(frame.getAttribute('height')).toBe('560')
    expect(frame.getAttribute('title')).toContain('Signer')
    const was = innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { container: p } = render(() => <SignGate status="unsigned" src="about:blank" title="Sign" />)
    await flush()
    button(p, 'Review and sign').click(); await flush()
    expect(p.querySelector('[data-part="blocker"] iframe')).toBeNull()
    expect(p.querySelector('dialog iframe')).not.toBeNull()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: was })
  })
  test.each([['expired', 'Resend', 'critical'], ['declined', 'Resend', 'critical'], ['error', 'Retry', 'neutral']] as const)('%s has one action', (status, action, tone) => {
    const act = vi.fn()
    const { container: c } = render(() => <><SignGateBadge status={status} /><SignGate status={status} title="Sign" onResend={act} onRetry={act} /></>)
    expect(c.querySelector('iframe')).toBeNull()
    button(c, action).click()
    expect(act).toHaveBeenCalledOnce()
    expect(c.querySelector('[data-scope="badge"]')!.getAttribute('data-tone')).toBe(tone)
  })
})

test('Checklist: the counter and rail follow the items, a completion is said once, then Hide offers Undo', async () => {
  vi.useFakeTimers()
  const items = state([{ id: 'a', title: 'One', done: true }, { id: 'b', title: 'Two', action: { label: 'Do it', onClick() {} } }])
  const undo = vi.fn()
  const { container: c } = render(() => <><Toaster /><Checklist items={items.value} onHide={() => {}} onUndoHide={undo} /></>)
  await tick(0)
  const root = c.querySelector<HTMLElement>('[data-scope="checklist"]')!
  expect(c.querySelector('[data-scope="checklist"] [data-part="title"]')!.textContent).toContain('1 of 2')
  const rail = c.querySelector('[role="progressbar"]')!
  expect(rail.getAttribute('aria-valuenow')).toBe('1')
  expect(c.querySelector('[data-part="item"]')!.textContent).toContain(', done')
  expect(c.querySelectorAll('[data-part="item"]')[1]!.textContent).toContain(', to do')
  expect(c.querySelector<HTMLInputElement>('[data-part="item"] input')!.disabled).toBe(true) // from server state, not clicks
  items.value = items.value.map(i => ({ ...i, done: true })) as typeof items.value
  await tick(100)
  expect(root.dataset.state).toBe('complete')
  expect(said()).toBe('All set up.')
  button(c, 'Hide checklist').click(); await tick(0)
  expect(root.hidden).toBe(true)
  button(c.querySelector('[data-scope="toast"][data-part="root"]')!, 'Undo').click(); await tick(0)
  expect(root.hidden).toBe(false)
  expect(undo).toHaveBeenCalledOnce()
})

describe('Tour', () => {
  const steps = [{ target: '#one', title: 'First', body: 'Body one.' }, { target: '#gone', title: 'Missing', body: '-' }, { target: '#two', title: 'Last', body: 'Body two.', interactive: true }]
  const settle = async () => { await tick(0); await tick(0) }
  test('focus to the card, the target described by it, a missing target skipped, Done ends it, focus returns', async () => {
    vi.useFakeTimers()
    const open = state(false), done = vi.fn()
    const { container: c } = render(() => <div><Toaster /><button id="start">Start</button><button id="one">One</button><button id="two">Two</button><Tour open={open} steps={steps} onDone={done} /></div>)
    await tick(0)
    const start = c.querySelector<HTMLElement>('#start')!
    start.focus()
    open.value = true
    await settle()
    const card = c.querySelector<HTMLElement>('[data-part="card"]')!
    expect(document.activeElement).toBe(card.querySelector('h4'))
    expect(card.textContent).toContain('Step 1 of 3')
    expect(button(card, 'Back')).toBeUndefined()
    const one = c.querySelector('#one')!
    const body = card.getAttribute('aria-describedby')!
    expect(one.getAttribute('aria-describedby')).toBe(body)
    button(card, 'Next').click()
    await settle(); await settle()
    expect(card.querySelector('h4')!.textContent).toBe('Last')
    expect(one.hasAttribute('aria-describedby')).toBe(false)
    expect(button(card, 'Done')).toBeTruthy()
    button(card, 'Done').click()
    await settle()
    expect(c.querySelector('[data-scope="tour"]')).toBeNull()
    expect(done).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(start)
    expect(open.value).toBe(false)
  })
  test('Esc ends it and Tab stays in the card; the scrim blocks presses unless the step is interactive', async () => {
    vi.useFakeTimers()
    const open = state(true), skip = vi.fn(), pressed = vi.fn()
    const { container: c } = render(() => <><Toaster /><button id="one" onClick={pressed}>One</button><button id="two" onClick={pressed}>Two</button><Tour open={open} steps={[steps[0]!, steps[2]!]} onSkip={skip} /></>)
    await settle()
    const card = c.querySelector<HTMLElement>('[data-part="card"]')!
    c.querySelector<HTMLElement>('#one')!.click()
    expect(pressed).not.toHaveBeenCalled()
    fireEvent.keyDown(card, { key: 'ArrowRight' }); await settle()
    expect(card.querySelector('h4')!.textContent).toBe('Last')
    c.querySelector<HTMLElement>('#two')!.click()
    expect(pressed).toHaveBeenCalledOnce()
    const all = [...card.querySelectorAll('button')]
    all.at(-1)!.focus()
    fireEvent.keyDown(card, { key: 'Tab' })
    expect(document.activeElement).toBe(all[0])
    fireEvent.keyDown(card, { key: 'Escape' })
    await settle()
    expect(c.querySelector('[data-scope="tour"]')).toBeNull()
    expect(skip).toHaveBeenCalledOnce()
  })
  test('never over another overlay', async () => {
    vi.useFakeTimers()
    const d = document.body.appendChild(document.createElement('dialog'))
    d.setAttribute('open', '')
    const open = state(true)
    const { container: c } = render(() => <><button id="one">One</button><Tour open={open} steps={[steps[0]!]} /></>)
    await settle()
    expect(open.value).toBe(false)
    expect(c.querySelector('[data-scope="tour"]')).toBeNull()
  })
  test('a coachmark: the beacon opens the card; Got it dismisses', async () => {
    vi.useFakeTimers()
    const gone = vi.fn()
    const { container: c } = render(() => <><button id="one">One</button><Coachmark target="#one" title="New" body="Here." onDismiss={gone} /></>)
    await settle()
    const beacon = button(c, 'Show tip')
    expect(beacon.querySelector('[data-part="beacon"]')).not.toBeNull()
    expect(c.querySelector('[data-part="card"]')).toBeNull()
    beacon.click(); await settle()
    expect(document.activeElement).toBe(c.querySelector('[data-part="card"] h4'))
    button(c, 'Got it').click(); await settle()
    expect(gone).toHaveBeenCalledOnce()
    expect(c.querySelector<HTMLElement>('[data-scope="tour"]')!.hidden).toBe(true)
  })
})

describe('SystemPage', () => {
  test('404 searches; 500 retries; maintenance says when; empty teaches', () => {
    const search = vi.fn(), retry = vi.fn()
    const { container: c } = render(() => <SystemPage kind="404" onSearch={search} requestId="req_1" />)
    expect(c.querySelector('[data-part="code"]')!.textContent).toContain('404')
    expect(c.querySelector('[data-part="title"]')!.textContent).toBe("We can't find that page")
    named(c, 'q').value = 'deploys'
    fireEvent.submit(c.querySelector('form')!)
    expect(search).toHaveBeenCalledWith('deploys')
    const { container: f } = render(() => <SystemPage kind="500" error={new Error('secret')} onRetry={retry} />)
    expect(f.textContent).not.toContain('secret')
    button(f, 'Try again').click()
    expect(retry).toHaveBeenCalledOnce()
    const { container: m } = render(() => <SystemPage kind="maintenance" backAt="14:00 UTC" />)
    expect(m.querySelector('[data-part="title"]')!.textContent).toBe('Back at 14:00 UTC')
    const { container: e } = render(() => <SystemPage kind="empty" title="No projects yet" primary={{ label: 'Create project' }} />)
    expect(button(e, 'Create project')).toBeTruthy()
  })
  const object = { title: 'Q4 brief', owner: 'Kofi Mensah' }
  const accounts = [{ id: 'a', email: 'jo@acme.co', hasAccess: true }, { id: 'b', email: 'jo@loom.app', current: true }]
  test('403: request → note → pending (title focused, status said) → withdraw', async () => {
    vi.useFakeTimers()
    const send = vi.fn(), withdraw = vi.fn()
    const { container: c } = render(() => <><Toaster /><SystemPage kind="403" object={object} account="jo@loom.app" request={{ approvers: 'Kofi and Ana', onSend: send, onWithdraw: withdraw }} /></>)
    await tick(0)
    expect(document.activeElement).toBe(c.querySelector('[data-scope="system-page"] [data-part="title"]'))
    expect(c.textContent).toContain("You don't have access to Q4 brief")
    expect(c.textContent).toContain("You're signed in as jo@loom.app.")
    button(c, 'Request access').click(); await tick(0)
    const note = c.querySelector('textarea')!
    expect(document.activeElement).toBe(note)
    note.value = 'For the review'; fireEvent.input(note); await tick(0)
    button(c, 'Send request').click(); await tick(100)
    expect(send).toHaveBeenCalledWith('For the review')
    expect(c.querySelector('[data-scope="system-page"] [data-part="title"]')!.textContent).toBe('Request sent')
    expect(c.querySelector('[data-part="pending"]')!.getAttribute('role')).toBe('status')
    expect(document.activeElement).toBe(c.querySelector('[data-scope="system-page"] [data-part="title"]'))
    expect(said()).toContain('Request sent to Kofi and Ana')
    button(c, 'Withdraw request').click(); await tick(0)
    expect(withdraw).toHaveBeenCalledOnce()
    expect(button(c, 'Request access')).toBeTruthy()
  })
  test("403: a workspace that takes no requests; the granted state loads the object in place", async () => {
    vi.useFakeTimers()
    const granted = state(false)
    const { container: c } = render(() => <><Toaster /><SystemPage kind="403" object={object} account="jo@loom.app" request={{ allowed: false, link: 'https://a/b' }} granted={granted.value}><p>The brief</p></SystemPage></>)
    await tick(0)
    expect(c.textContent).toContain("This workspace doesn't take access requests. Ask Kofi Mensah to share it with jo@loom.app.")
    expect(button(c, 'Copy link for the owner')).toBeTruthy()
    granted.value = true
    await tick(100)
    expect(c.querySelector('[data-scope="system-page"]')).toBeNull()
    expect(c.textContent).toContain('The brief')
    expect(c.querySelector('[data-scope="toast"][data-part="root"]')!.textContent).toContain('Q4 brief is open.')
    expect(said()).toContain('Kofi Mensah gave you access')
  })
  test('403: Switch account is a menu that marks who has access; the request id copies', async () => {
    vi.useFakeTimers()
    const pick = vi.fn()
    const { container: c } = render(() => <><Toaster /><SystemPage kind="403" object={object} accounts={accounts} onSwitch={pick} requestId="req_7" /></>)
    await tick(0)
    const trigger = button(c, 'Switch account')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    const list = c.querySelector<HTMLElement>('[data-part="accounts"]')!
    expect(list.hidden).toBe(true)
    trigger.click(); await tick(0)
    expect(list.hidden).toBe(false)
    expect(document.activeElement).toBe(list.querySelector('[role="menuitem"]'))
    expect(list.textContent).toContain('Has access')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Escape' }); await tick(0)
    expect(list.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
    trigger.click(); await tick(0)
    ;(list.querySelector('[role="menuitem"]') as HTMLElement).click(); await tick(0)
    expect(pick).toHaveBeenCalledWith('a')
    button(c, 'Copy request ID').click(); await tick(100)
    expect(said()).toBe('Copied')
  })
})

describe('ConnBanner', () => {
  test('offline, reconnecting, back online for 3s; assertive once, then polite once', async () => {
    vi.useFakeTimers()
    const online = state(false), st = state<string>('offline'), retry = vi.fn()
    const { container: c } = render(() => <><Toaster /><ConnBanner online={online} state={st} retryIn={4} onRetry={retry} changes={2} /></>)
    await tick(100)
    const conn = () => c.querySelector<HTMLElement>('[data-scope="conn"]')
    expect(conn()!.dataset.state).toBe('offline')
    expect(conn()!.textContent).toContain('Retrying in 4s')
    expect(conn()!.hasAttribute('role')).toBe(false) // the ticking text never reads out
    expect(document.querySelector('[data-scope="announcer"][aria-live="assertive"]')!.textContent).toContain("You're offline")
    await tick(1000)
    expect(conn()!.textContent).toContain('Retrying in 3s')
    button(c, 'Retry now').click()
    expect(retry).toHaveBeenCalledOnce()
    online.value = true; st.value = 'reconnecting'; await tick(0)
    expect(conn()!.dataset.state).toBe('reconnecting')
    expect(conn()!.textContent).toContain('Sending 2 changes.')
    st.value = 'live'; await tick(100)
    expect(conn()!.dataset.state).toBe('online')
    expect(conn()!.textContent).toContain('2 changes synced.')
    expect(document.querySelector('[data-scope="announcer"][aria-live="polite"]')!.textContent).toContain('Back online')
    await tick(3100)
    expect(conn()).toBeNull()
  })
  test('takes the online() factory', async () => {
    const live = state(false)
    const { container: c } = render(() => <ConnBanner online={() => live} />)
    await flush()
    expect(c.querySelector('[data-scope="conn"]')).not.toBeNull()
    live.value = true; await flush()
    expect(c.querySelector<HTMLElement>('[data-scope="conn"]')!.dataset.state).toBe('online')
  })
  test('stale: Reload runs, Later hides it for 30 minutes, a failed contract turns it caution', async () => {
    vi.useFakeTimers()
    const reload = vi.fn(), failed = state(false)
    const { container: c } = render(() => <><Toaster /><ConnBanner stale name="Fieldwork" onReload={reload} contractFailed={failed.value} /></>)
    await tick(100)
    const conn = () => c.querySelector<HTMLElement>('[data-scope="conn"]')
    expect(conn()!.dataset.state).toBe('stale')
    expect(conn()!.textContent).toContain('A new version of Fieldwork is ready.')
    button(c, 'Reload').click()
    expect(reload).toHaveBeenCalledOnce()
    failed.value = true; await tick(0)
    expect(conn()!.dataset.state).toBe('limited')
    expect(conn()!.textContent).toContain('Reload to finish saving.')
    button(c, 'Later').click(); await tick(0)
    expect(conn()).toBeNull()
    await tick(30 * 60 * 1000 + 10)
    expect(conn()).not.toBeNull()
  })
})

test('RateLimited: counts down in place, the trigger says why, and comes back by itself', async () => {
  vi.useFakeTimers()
  const press = vi.fn(), done = vi.fn()
  const { container: c } = render(() => <><Toaster /><RateLimited retryAfter={2} title="Export limit reached." description="You can run 5 exports a minute." trigger={{ children: 'Export CSV', onClick: press }} onDone={done} /></>)
  await tick(100)
  expect(said()).toBe('Export limit reached. Try again in 2s.')
  const trigger = c.querySelector<HTMLButtonElement>('[data-scope="conn"] ~ div button')!
  expect(trigger.disabled).toBe(true)
  expect(trigger.textContent).toBe('Try again in 2s')
  expect(c.querySelector('[data-scope="conn"]')!.textContent).toContain('Try again in 2s.')
  await tick(1000)
  expect(c.querySelector<HTMLElement>('[data-scope="conn"] [data-part="rail-fill"]')!.style.getPropertyValue('--p')).toBe('0.5')
  await tick(1100)
  expect(c.querySelector('[data-scope="conn"]')).toBeNull()
  expect(trigger.disabled).toBe(false)
  expect(trigger.textContent).toBe('Export CSV')
  expect(done).toHaveBeenCalledOnce()
  expect(said()).toBe('You can try again now.')
})

describe('ShortcutsOverlay', () => {
  const key = (k: string, target: Element | Document = document.body, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key: k, ...init })
  test('? opens it outside a text field, never inside; turned off, it stays shut', async () => {
    const open = state(false)
    const { container: c } = render(() => <><input id="t" /><ShortcutsOverlay open={open} /></>)
    await flush()
    key('?', c.querySelector('#t')!); await flush()
    expect(open.value).toBe(false)
    shortcuts.singleKeys = false
    key('?'); await flush()
    expect(open.value).toBe(false)
    shortcuts.singleKeys = true
    key('?'); await flush()
    expect(open.value).toBe(true)
  })
  test('lists the registry by group, platform-aware, with a filter over names and keys', async () => {
    const drop = [shortcuts.register({ keys: 'mod+k', label: 'Search', group: 'Navigation' }), shortcuts.register({ keys: 'g m', label: 'Go to members', group: 'Navigation' })]
    const open = state(true)
    const { container: c } = render(() => <ShortcutsOverlay open={open} />)
    await flush()
    const shown = () => [...c.querySelectorAll('[data-scope="shortcuts"] section')].map(s => s.querySelector('h4')!.textContent)
    expect(shown()).toEqual(['Navigation', 'Help'])
    const row = [...c.querySelectorAll('dl > div')].find(d => d.textContent.includes('Go to members'))!
    expect(row.querySelector('dd')!.textContent).toBe('G then M')
    expect([...c.querySelectorAll('dl > div')].find(d => d.textContent.includes('Search'))!.querySelector('dd')!.textContent).toBe('CtrlK')
    const filter = c.querySelector<HTMLInputElement>('[data-scope="shortcuts"] input')!
    type(filter, 'memb'); await flush()
    expect(c.querySelectorAll('dl > div').length).toBe(1)
    expect(c.querySelector('mark')!.textContent).toBe('memb')
    type(filter, 'zzz'); await flush()
    expect(c.querySelector('[data-part="empty"]')!.textContent).toContain('zzz')
    drop.forEach(d => d())
  })
})

