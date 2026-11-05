import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { Flow } from '../src/flow/Flow'
import { OtpField } from '../src/flow/Otp'
import { SignIn } from '../src/flow/SignIn'
import { SystemPage, type SystemPageProps } from '../src/flow/SystemPage'
import { Coachmark, Tour, type TourStep } from '../src/flow/Tour'
import { Toaster } from '../src/Toast'
import { button, said, type, named, tick } from './flow-support'

export function registerFlow() {
  describe('Flow', () => {
    const steps = [
      {
        id: 'a',
        label: 'Cart',
        render: () => (
          <h2 data-part="step-title" tabindex="-1">
            Cart
          </h2>
        ),
      },
      {
        id: 'b',
        label: 'Shipping',
        render: () => (
          <>
            <h2 data-part="step-title" tabindex="-1">
              Shipping
            </h2>
            <input />
          </>
        ),
      },
      { id: 'c', label: 'Pay', render: () => <input data-autofocus="" aria-label="Card" /> },
    ]
    flowNavigation(steps)
    flowHistory(steps)
    flowUrl(steps)
  })
}

function flowNavigation(steps: Parameters<typeof Flow>[0]['steps']) {
  test('moves forward and back: direction, states, title focus, polite step, content kept', async () => {
    vi.useFakeTimers()
    const step = state('a')
    const { container: c } = render(() => (
      <>
        <Toaster />
        <Flow step={step} steps={steps} />
      </>
    ))
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
}

function flowHistory(steps: Parameters<typeof Flow>[0]['steps']) {
  test('history: one entry a step; Back goes back a step; a URL opens its step', async () => {
    history.replaceState(null, '', '/?x=1')
    const push = vi.spyOn(history, 'pushState')
    const step = state('a')
    const seen: string[] = []
    const { container: c } = render(() => (
      <Flow step={step} steps={steps} history onStepChange={(v) => seen.push(v)} />
    ))
    await flush()
    await Promise.resolve()
    await flush()
    expect(location.search).toBe('?x=1&step=a')
    step.value = 'b'
    await flush()
    await Promise.resolve()
    await flush()
    expect(push).toHaveBeenCalledOnce()
    expect(location.search).toBe('?x=1&step=b')
    history.replaceState(null, '', '/?x=1&step=a')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flush()
    await Promise.resolve()
    await flush()
    expect(step.value).toBe('a')
    expect(push).toHaveBeenCalledOnce()
    expect(c.querySelector<HTMLElement>('[data-step="a"]')!.dataset.state).toBe('active')
    push.mockRestore()
  })
}

function flowUrl(steps: Parameters<typeof Flow>[0]['steps']) {
  test('a ?step= in the URL wins on load', async () => {
    history.replaceState(null, '', '/?step=b')
    const { container: c } = render(() => <Flow defaultStep="a" steps={steps} history="step" />)
    await flush()
    await Promise.resolve()
    await flush()
    expect(c.querySelector<HTMLElement>('[data-step="b"]')!.dataset.state).toBe('active')
  })
}

export function registerSignIn() {
  describe('SignIn', () => {
    signInFields()
    signInEmail()
    signInError()
    signInRateLimit()
    signInRetry()
    signInEmbedded()
    signInMagicLink()
  })
}

function signInFields() {
  test('checks its fields, focuses the first invalid, then submits the values', async () => {
    const onSubmit = vi.fn()
    const { container: c } = render(() => <SignIn onSubmit={onSubmit} />)
    const form = c.querySelector('form')!
    fireEvent.submit(form)
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(named(c, 'email'))
    expect(named(c, 'email').getAttribute('aria-invalid')).toBe('true')
    expect(c.textContent).toContain('Enter your work email.')
    named(c, 'email').value = 'ada@fieldwork.dev'
    named(c, 'password').value = 'hunter22'
    fireEvent.submit(form)
    await flush()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      email: 'ada@fieldwork.dev',
      password: 'hunter22',
      remember: 'on',
    })
  })
}

function signInEmail() {
  test('the email is checked on blur and offers passkeys from first focus', async () => {
    const { container: c } = render(() => <SignIn />)
    const email = named(c, 'email')
    expect(email.autocomplete).toBe('username webauthn')
    email.value = 'nope'
    fireEvent.blur(email)
    await flush()
    expect(c.textContent).toContain("doesn't look like an email")
    email.value = 'a@b.co'
    fireEvent.blur(email)
    await flush()
    expect(email.hasAttribute('aria-invalid')).toBe(false)
  })
}

function signInError() {
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
}

function signInRateLimit() {
  test('RATE_LIMITED: a live countdown, submit disabled with the reason, back by itself', async () => {
    vi.useFakeTimers()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SignIn error={{ code: 'RATE_LIMITED', data: { retryAfter: 2 } }} />
      </>
    ))
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
}

function signInRetry() {
  test('a network failure is a toast with Retry; the values stay', async () => {
    const error = state<unknown>(undefined)
    const retry = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SignIn error={error.value} onRetry={retry} />
      </>
    ))
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
}

function signInEmbedded() {
  test('inside <Form of>: no second form; reads pending, errors and the message from it', async () => {
    const pending = state(false),
      errors = state<Record<string, string>>({}),
      message = state<string | undefined>(undefined)
    const form = {
      pending,
      errors,
      message,
      value: (n: string) => (n === 'email' ? 'back@a.co' : undefined),
    }
    const { container: c } = render(() => (
      <form>
        <SignIn form={form} />
      </form>
    ))
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
}

function signInMagicLink() {
  test('magic link asks for the email first', async () => {
    const onMagicLink = vi.fn()
    const { container: c } = render(() => <SignIn onMagicLink={onMagicLink} />)
    button(c, 'Email me a sign-in link instead').click()
    await flush()
    expect(onMagicLink).not.toHaveBeenCalled()
    expect(c.textContent).toContain('Enter your email first')
    named(c, 'email').value = 'a@b.co'
    button(c, 'Email me a sign-in link instead').click()
    await flush()
    expect(onMagicLink).toHaveBeenCalledWith('a@b.co')
  })
}

export function registerOtpField() {
  describe('OtpField', () => {
    const chars = (c: ParentNode) =>
      [...c.querySelectorAll('[data-part="char"]')].map((x) => x.textContent).join('')

    const mount = async (node: () => unknown) => {
      const r = render(node)
      await flush()
      await Promise.resolve()
      return r
    }
    otpInput(mount)
    otpDigits(chars, mount)
    otpPaste(chars, mount)
    otpError(mount)
    otpSuccess(mount)
  })
}

function otpInput(mount: (node: () => unknown) => Promise<ReturnType<typeof render>>) {
  test('one input, six cells, a labelled tab stop', async () => {
    const { container: c } = await mount(() => <OtpField />)
    const input = c.querySelector('input')!
    expect(c.querySelectorAll('[data-part="cell"]').length).toBe(6)
    expect(c.querySelector('label')!.getAttribute('for')).toBe(input.id)
    expect(input.autocomplete).toBe('one-time-code')
    expect(input.inputMode).toBe('numeric')
    input.focus()
    fireEvent.focus(input)
    expect(c.querySelectorAll('[data-part="cell"]')[0]!.hasAttribute('data-pin')).toBe(true)
  })
}

function otpDigits(
  chars: (c: ParentNode) => string,
  mount: (node: () => unknown) => Promise<ReturnType<typeof render>>,
) {
  test('digits only; the last digit completes and submits the form', async () => {
    const done = vi.fn()
    const submit = vi.fn((e: Event) => e.preventDefault())
    const { container: c } = await mount(() => (
      <form onSubmit={submit}>
        <OtpField onComplete={done} />
      </form>
    ))
    const input = c.querySelector('input')!
    type(input, '1a2')
    expect(input.value).toBe('12')
    expect(chars(c)).toBe('12')
    type(input, '123456')
    expect(done).toHaveBeenCalledWith('123456')
    expect(submit).toHaveBeenCalledOnce()
  })
}

function otpPaste(
  chars: (c: ParentNode) => string,
  mount: (node: () => unknown) => Promise<ReturnType<typeof render>>,
) {
  test('a paste of the whole code, spaces and all, fills every cell', async () => {
    const done = vi.fn()
    const { container: c } = await mount(() => <OtpField autoSubmit={false} onComplete={done} />)
    const input = c.querySelector('input')!
    fireEvent.paste(input, { clipboardData: { getData: () => '123 456' } })
    expect(chars(c)).toBe('123456')
    expect(done).toHaveBeenCalledWith('123456')
  })
}

function otpError(mount: (node: () => unknown) => Promise<ReturnType<typeof render>>) {
  test('a wrong code pins every cell, clears, refocuses; the message stays until the next key', async () => {
    const error = state<string | undefined>(undefined)
    const { container: c } = await mount(() => <OtpField error={error.value} autoSubmit={false} />)
    const input = c.querySelector('input')!,
      root = c.querySelector('[data-scope="otp"]')!
    type(input, '000000')
    error.value = "That code didn't work. 2 tries left."
    await flush()
    await Promise.resolve()
    await flush()
    expect(root.hasAttribute('data-invalid')).toBe(true)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(c.querySelectorAll('[data-part="cell"][data-pin]').length).toBe(6)
    expect(c.querySelector('[role="alert"]')!.textContent).toContain('2 tries left')
    type(input, '1')
    await flush()
    expect(root.hasAttribute('data-invalid')).toBe(false)
    expect(c.querySelector('[role="alert"]')).toBeNull()
  })
}

function otpSuccess(mount: (node: () => unknown) => Promise<ReturnType<typeof render>>) {
  test('success pins every cell for the cascade', async () => {
    const status = state<'idle' | 'success'>('idle')
    const { container: c } = await mount(() => (
      <OtpField status={status.value} autoSubmit={false} />
    ))
    status.value = 'success'
    await flush()
    await Promise.resolve()
    await flush()
    expect(c.querySelector<HTMLElement>('[data-scope="otp"]')!.dataset.state).toBe('success')
    expect(c.querySelectorAll('[data-part="cell"][data-pin]').length).toBe(6)
    expect(
      c.querySelectorAll<HTMLElement>('[data-part="cell"]')[5]!.style.getPropertyValue('--n'),
    ).toBe('5')
  })
}

export function registerTour() {
  describe('Tour', () => {
    const steps = [
      { target: '#one', title: 'First', body: 'Body one.' },
      { target: '#gone', title: 'Missing', body: '-' },
      { target: '#two', title: 'Last', body: 'Body two.', interactive: true },
    ]

    const settle = async () => {
      await tick(0)
      await tick(0)
    }
    tourNavigation(steps, settle)
    tourKeyboard(steps, settle)
    tourOverlay(steps, settle)
    tourCoachmark(settle)
  })
}

function tourNavigation(steps: TourStep[], settle: () => Promise<void>) {
  test('focus to the card, the target described by it, a missing target skipped, Done ends it, focus returns', async () => {
    vi.useFakeTimers()
    const open = state(false),
      done = vi.fn()
    const { container: c } = render(() => (
      <div>
        <Toaster />
        <button id="start">Start</button>
        <button id="one">One</button>
        <button id="two">Two</button>
        <Tour open={open} steps={steps} onDone={done} />
      </div>
    ))
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
    await settle()
    await settle()
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
}

function tourKeyboard(steps: TourStep[], settle: () => Promise<void>) {
  test('Esc ends it and Tab stays in the card; the scrim blocks presses unless the step is interactive', async () => {
    vi.useFakeTimers()
    const open = state(true),
      skip = vi.fn(),
      pressed = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <button id="one" onClick={pressed}>
          One
        </button>
        <button id="two" onClick={pressed}>
          Two
        </button>
        <Tour open={open} steps={[steps[0]!, steps[2]!]} onSkip={skip} />
      </>
    ))
    await settle()
    const card = c.querySelector<HTMLElement>('[data-part="card"]')!
    c.querySelector<HTMLElement>('#one')!.click()
    expect(pressed).not.toHaveBeenCalled()
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    await settle()
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
}

function tourOverlay(steps: TourStep[], settle: () => Promise<void>) {
  test('never over another overlay', async () => {
    vi.useFakeTimers()
    const d = document.body.appendChild(document.createElement('dialog'))
    d.setAttribute('open', '')
    const open = state(true)
    const { container: c } = render(() => (
      <>
        <button id="one">One</button>
        <Tour open={open} steps={[steps[0]!]} />
      </>
    ))
    await settle()
    expect(open.value).toBe(false)
    expect(c.querySelector('[data-scope="tour"]')).toBeNull()
  })
}

function tourCoachmark(settle: () => Promise<void>) {
  test('a coachmark: the beacon opens the card; Got it dismisses', async () => {
    vi.useFakeTimers()
    const gone = vi.fn()
    const { container: c } = render(() => (
      <>
        <button id="one">One</button>
        <Coachmark target="#one" title="New" body="Here." onDismiss={gone} />
      </>
    ))
    await settle()
    const beacon = button(c, 'Show tip')
    expect(beacon.querySelector('[data-part="beacon"]')).not.toBeNull()
    expect(c.querySelector('[data-part="card"]')).toBeNull()
    beacon.click()
    await settle()
    expect(document.activeElement).toBe(c.querySelector('[data-part="card"] h4'))
    button(c, 'Got it').click()
    await settle()
    expect(gone).toHaveBeenCalledOnce()
    expect(c.querySelector<HTMLElement>('[data-scope="tour"]')!.hidden).toBe(true)
  })
}

export function registerSystemPage() {
  describe('SystemPage', () => {
    systemStates()

    const object = { title: 'Q4 brief', owner: 'Kofi Mensah' }

    const accounts = [
      { id: 'a', email: 'jo@acme.co', hasAccess: true },
      { id: 'b', email: 'jo@loom.app', current: true },
    ]
    systemRequest(object)
    systemGranted(object)
    systemAccounts(object, accounts)
  })
}

function systemStates() {
  test('404 searches; 500 retries; maintenance says when; empty teaches', () => {
    const search = vi.fn(),
      retry = vi.fn()
    const { container: c } = render(() => (
      <SystemPage kind="404" onSearch={search} requestId="req_1" />
    ))
    expect(c.querySelector('[data-part="code"]')!.textContent).toContain('404')
    expect(c.querySelector('[data-part="title"]')!.textContent).toBe("We can't find that page")
    named(c, 'q').value = 'deploys'
    fireEvent.submit(c.querySelector('form')!)
    expect(search).toHaveBeenCalledWith('deploys')
    const { container: f } = render(() => (
      <SystemPage kind="500" error={new Error('secret')} onRetry={retry} />
    ))
    expect(f.textContent).not.toContain('secret')
    button(f, 'Try again').click()
    expect(retry).toHaveBeenCalledOnce()
    const { container: m } = render(() => <SystemPage kind="maintenance" backAt="14:00 UTC" />)
    expect(m.querySelector('[data-part="title"]')!.textContent).toBe('Back at 14:00 UTC')
    const { container: e } = render(() => (
      <SystemPage kind="empty" title="No projects yet" primary={{ label: 'Create project' }} />
    ))
    expect(button(e, 'Create project')).toBeTruthy()
  })
}

function systemRequest(object: NonNullable<SystemPageProps['object']>) {
  test('403: request → note → pending (title focused, status said) → withdraw', async () => {
    vi.useFakeTimers()
    const send = vi.fn(),
      withdraw = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SystemPage
          kind="403"
          object={object}
          account="jo@loom.app"
          request={{ approvers: 'Kofi and Ana', onSend: send, onWithdraw: withdraw }}
        />
      </>
    ))
    await tick(0)
    expect(document.activeElement).toBe(
      c.querySelector('[data-scope="system-page"] [data-part="title"]'),
    )
    expect(c.textContent).toContain("You don't have access to Q4 brief")
    expect(c.textContent).toContain("You're signed in as jo@loom.app.")
    button(c, 'Request access').click()
    await tick(0)
    const note = c.querySelector('textarea')!
    expect(document.activeElement).toBe(note)
    note.value = 'For the review'
    fireEvent.input(note)
    await tick(0)
    button(c, 'Send request').click()
    await tick(100)
    expect(send).toHaveBeenCalledWith('For the review')
    expect(c.querySelector('[data-scope="system-page"] [data-part="title"]')!.textContent).toBe(
      'Request sent',
    )
    expect(c.querySelector('[data-part="pending"]')!.getAttribute('role')).toBe('status')
    expect(document.activeElement).toBe(
      c.querySelector('[data-scope="system-page"] [data-part="title"]'),
    )
    expect(said()).toContain('Request sent to Kofi and Ana')
    button(c, 'Withdraw request').click()
    await tick(0)
    expect(withdraw).toHaveBeenCalledOnce()
    expect(button(c, 'Request access')).toBeTruthy()
  })
}

function systemGranted(object: NonNullable<SystemPageProps['object']>) {
  test('403: a workspace that takes no requests; the granted state loads the object in place', async () => {
    vi.useFakeTimers()
    const granted = state(false)
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SystemPage
          kind="403"
          object={object}
          account="jo@loom.app"
          request={{ allowed: false, link: 'https://a/b' }}
          granted={granted.value}
        >
          <p>The brief</p>
        </SystemPage>
      </>
    ))
    await tick(0)
    expect(c.textContent).toContain(
      "This workspace doesn't take access requests. Ask Kofi Mensah to share it with jo@loom.app.",
    )
    expect(button(c, 'Copy link for the owner')).toBeTruthy()
    granted.value = true
    await tick(100)
    expect(c.querySelector('[data-scope="system-page"]')).toBeNull()
    expect(c.textContent).toContain('The brief')
    expect(c.querySelector('[data-scope="toast"][data-part="root"]')!.textContent).toContain(
      'Q4 brief is open.',
    )
    expect(said()).toContain('Kofi Mensah gave you access')
  })
}

function systemAccounts(
  object: NonNullable<SystemPageProps['object']>,
  accounts: NonNullable<SystemPageProps['accounts']>,
) {
  test('403: Switch account is a menu that marks who has access; the request id copies', async () => {
    vi.useFakeTimers()
    const pick = vi.fn()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SystemPage
          kind="403"
          object={object}
          accounts={accounts}
          onSwitch={pick}
          requestId="req_7"
        />
      </>
    ))
    await tick(0)
    const trigger = button(c, 'Switch account')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    const list = c.querySelector<HTMLElement>('[data-part="accounts"]')!
    expect(list.hidden).toBe(true)
    trigger.click()
    await tick(0)
    expect(list.hidden).toBe(false)
    expect(document.activeElement).toBe(list.querySelector('[role="menuitem"]'))
    expect(list.textContent).toContain('Has access')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Escape' })
    await tick(0)
    expect(list.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
    trigger.click()
    await tick(0)
    ;(list.querySelector('[role="menuitem"]') as HTMLElement).click()
    await tick(0)
    expect(pick).toHaveBeenCalledWith('a')
    button(c, 'Copy request ID').click()
    await tick(100)
    expect(said()).toBe('Copied')
  })
}
