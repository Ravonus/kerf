import { registerApiKeys } from './admin/api-keys'
import { registerCheckout } from './admin/checkout'
import { registerIntegrations } from './admin/integrations'
import { registerMembersTable } from './admin/members-table'
import { registerSaveBar } from './admin/save-bar'
import { NOW, byText, dialog, field, pick, tick, toasts, type } from './admin/support'
// The admin pack driven as a user would.
import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import type { CartLine } from '@weft-js/warp-core'
import { AuditLog } from '../src/admin/Audit'
import { Invoices, PayFrame, PaymentMethods } from '../src/admin/Billing'
import { CartDrawer } from '../src/admin/Cart'
import { CsvImport } from '../src/admin/CsvImport'
import { TypeToConfirm } from '../src/admin/Danger'
import { RolesMatrix } from '../src/admin/Members'
import { PlanPicker, UsageMeter } from '../src/admin/Plans'
import { TagsInput } from '../src/admin/TagsInput'
import { Toaster } from '../src/Toast'
import { AUDIT, CARDS, CART, INVOICES, PLANS, ROLES, SAMPLE, TARGETS } from './fixtures/pack-admin'

beforeAll(() => {
  ;(HTMLDialogElement.prototype as { showModal: (this: HTMLDialogElement) => void }).showModal ??=
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  ;(HTMLDialogElement.prototype as unknown as { close?: unknown }).close ??= function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open')
  }
})

registerSaveBar()

test('TypeToConfirm: focus in the field, disabled until exact, Enter only then', async () => {
  const open = state(true)
  let n = 0
  render(() => (
    <TypeToConfirm
      open={open}
      title="Delete?"
      confirmText="prod"
      action="Delete project"
      onConfirm={() => {
        n++
      }}
    />
  ))
  await tick()
  const input = dialog().querySelector('input')!
  expect(document.activeElement).toBe(input)
  expect(
    dialog().querySelector('[data-part="header"] [data-part="mark"]')?.getAttribute('data-tone'),
  ).toBe('critical')
  const go = byText(dialog(), 'Delete project') as HTMLButtonElement
  expect(go.disabled).toBe(true)
  type(input, 'Prod')
  await tick()
  fireEvent.submit(input.closest('form')!)
  await tick()
  expect(n).toBe(0)
  type(input, 'prod')
  await tick()
  expect(go.disabled).toBe(false)
  fireEvent.submit(input.closest('form')!)
  await tick()
  expect(n).toBe(1)
  expect(open.value).toBe(false)
})

test('TagsInput: Enter, comma, paste; invalid stays critical; Backspace highlights then removes', async () => {
  const value = state<string[]>([])
  const { container: c } = render(() => (
    <>
      <TagsInput label="Emails" value={value} valid={(t) => t.includes('@')} />
      <Toaster />
    </>
  ))
  const input = c.querySelector<HTMLInputElement>('input')!
  type(input, 'a@x.dev')
  fireEvent.keyDown(input, { key: 'Enter' })
  await tick()
  type(input, 'nope')
  fireEvent.keyDown(input, { key: ',' })
  await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope'])
  fireEvent.paste(input, { clipboardData: { getData: () => 'b@x.dev, c@x.dev; a@x.dev' } })
  await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope', 'b@x.dev', 'c@x.dev'])
  expect(c.querySelectorAll('[data-scope="tag"][data-tone="critical"]').length).toBe(1)
  fireEvent.keyDown(input, { key: 'Backspace' })
  await tick()
  expect(c.querySelector('[data-highlighted]')!.textContent).toContain('c@x.dev')
  expect(value.value.length).toBe(4)
  fireEvent.keyDown(input, { key: 'Backspace' })
  await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope', 'b@x.dev'])
})

registerMembersTable()

test('RolesMatrix says yes and no in words', () => {
  const { container: c } = render(() => (
    <RolesMatrix
      roles={ROLES.slice(0, 2)}
      permissions={[{ id: 'a', label: 'Bill', roles: ['owner'] }]}
    />
  ))
  expect(c.querySelector('tbody tr')!.textContent).toBe('BillYes–No')
})

registerApiKeys()

describe('PlanPicker', () => {
  test('arrow-picking only compares; the primary opens proration; a decline keeps the dialog', async () => {
    let answer: string | undefined = 'Your card was declined.'
    const asked: unknown[] = []
    const { container: c } = render(() => (
      <>
        <PlanPicker
          plans={PLANS}
          current="team"
          seats={9}
          daysLeft={9}
          onChange={(p, i) => {
            asked.push([p.id, i])
            return answer
          }}
        />
        <Toaster />
      </>
    ))
    const radio = c.querySelector<HTMLInputElement>('input[value="scale"]')!
    radio.click()
    await tick()
    expect(dialog()).toBeNull()
    byText(c, 'Upgrade to Scale').click()
    await tick()
    const d = dialog()
    expect(d.querySelector('[data-part="total"]')!.textContent).toBe('Due today$108')
    byText(d, 'Confirm upgrade').click()
    await tick()
    expect(d.querySelector('[role="alert"]')!.textContent).toContain('declined')
    answer = undefined
    byText(d, 'Confirm upgrade').click()
    await tick()
    expect(asked).toEqual([
      ['scale', 'month'],
      ['scale', 'month'],
    ])
    expect(toasts()).toContain('You’re on Scale')
  })
  test('annual shows the per-month price; downgrades list what stops', async () => {
    const { container: c } = render(() => (
      <PlanPicker
        plans={PLANS}
        current="team"
        seats={9}
        daysLeft={9}
        losses={() => ['Preview environments']}
        onChange={() => {}}
      />
    ))
    c.querySelector<HTMLInputElement>('input[value="year"]')!.click()
    await tick()
    expect(
      c.querySelector('[data-scope="plan-card"]:nth-child(2) [data-part="price"]')!.textContent,
    ).toBe('$19per seat / month, billed yearly')
    c.querySelector<HTMLInputElement>('input[value="starter"]')!.click()
    await tick()
    byText(c, 'Switch to Starter').click()
    await tick()
    expect(dialog().textContent).toContain('Preview environments')
    expect(dialog().querySelector('[data-part="total"]')!.textContent).toContain('Due next period')
  })
})

test('UsageMeter: tones, tick and overage', () => {
  const { container: c } = render(() => (
    <>
      <UsageMeter label="A" value={50} limit={100} />
      <UsageMeter label="B" value={85} limit={100} />
      <UsageMeter label="C" value={125} limit={100} overage="+ $12.40 overage" />
    </>
  ))
  const m = [...c.querySelectorAll<HTMLElement>('[data-scope="meter"]')]
  expect(m.map((x) => x.dataset.tone)).toEqual([undefined, 'caution', 'critical'])
  expect(m[2]!.querySelector('[data-part="over"]')).not.toBeNull()
  expect(m[2]!.querySelector('[data-part="note"]')!.textContent).toBe('+ $12.40 overage')
  expect(m[0]!.querySelector('[role="meter"]')!.getAttribute('aria-valuetext')).toBe('50 of 100')
})

test('Invoices pin a banner on a failed payment; PaymentMethods give Undo', async () => {
  const fix: number[] = []
  const back: string[] = []
  const { container: c } = render(() => (
    <>
      <Invoices
        invoices={[
          ...INVOICES,
          { id: 'x', date: 'Jul 1', number: 'INV-1', status: 'failed', amount: 9 },
        ]}
        onUpdatePayment={() => fix.push(1)}
      />
      <PaymentMethods
        methods={CARDS}
        onDefault={() => {}}
        onRemove={() => {}}
        onRestore={(m) => back.push(m.id)}
      />
      <Toaster />
    </>
  ))
  byText(c, 'Update payment method').click()
  expect(fix).toEqual([1])
  byText(c, 'Remove Mastercard ending 5100').click()
  await tick()
  byText(document.body, 'Undo').click()
  expect(back).toEqual(['m'])
})

test('PayFrame: a titled iframe slot with a shimmer until it loads, never a card field', async () => {
  const { container: c } = render(() => <PayFrame title="Card fields" src="about:blank" testMode />)
  const f = c.querySelector('[data-scope="pay-frame"]')!
  expect(f.getAttribute('aria-busy')).toBe('true')
  expect(c.querySelector('iframe')!.title).toBe('Card fields')
  fireEvent.load(c.querySelector('iframe')!)
  await tick()
  expect(f.hasAttribute('data-state')).toBe(false)
  expect(c.querySelectorAll('input').length).toBe(0)
})

describe('AuditLog', () => {
  test('a filter change is announced', async () => {
    const { container: c } = render(() => (
      <>
        <AuditLog
          events={AUDIT}
          now={NOW}
          categories={[
            { value: 'all', label: 'All' },
            { value: 'keys', label: 'Keys' },
          ]}
        />
        <Toaster />
      </>
    ))
    c.querySelectorAll<HTMLInputElement>('[data-scope="segmented"] input')[1]!.click()
    await flush()
    await new Promise((r) => {
      setTimeout(r, 80)
    })
    expect(c.querySelector('[data-scope="announcer"]')!.textContent).toMatch(/\d+ events? shown/)
  })
  test('filters, exact time on hover, and the rate limit counts down on the button', async () => {
    vi.useFakeTimers()
    try {
      const { container: c } = render(() => (
        <>
          <AuditLog
            events={AUDIT}
            now={NOW}
            categories={[
              { value: 'all', label: 'All' },
              { value: 'keys', label: 'Keys' },
            ]}
            onExport={() => Promise.resolve({ retryAfter: 2 })}
          />
          <Toaster />
        </>
      ))
      const rows = () => c.querySelectorAll('tbody tr[data-id]').length
      expect(rows()).toBe(3)
      expect(c.querySelector('time')!.textContent).toBe('4 min ago')
      expect(c.querySelector('time')!.nextElementSibling!.textContent).toBe('2026-10-28 13:58 UTC')
      c.querySelector<HTMLInputElement>('input[value="keys"]')!.click()
      await flush()
      expect(rows()).toBe(1)
      const s = field(c, 'Date range') as unknown as HTMLSelectElement
      c.querySelector<HTMLInputElement>('input[value="all"]')!.click()
      await flush()
      s.value = '24h'
      fireEvent.change(s)
      await flush()
      expect(rows()).toBe(2)
      byText(c, 'Export CSV').click()
      await vi.advanceTimersByTimeAsync(0)
      await flush()
      const b = byText(c, 'Try again in 2s')
      expect(b.getAttribute('aria-disabled')).toBe('true')
      await vi.advanceTimersByTimeAsync(2000)
      await flush()
      expect(b.querySelector('[data-part="sweep-label"]')!.textContent).toBe('Export CSV')
    } finally {
      vi.useRealTimers()
    }
  })
})

registerIntegrations()

describe('CsvImport', () => {
  const mount = () => {
    const got: unknown[] = []
    const view = render(() => (
      <>
        <CsvImport
          targets={TARGETS}
          sample={SAMPLE}
          onImport={(r, p) => {
            got.push(r)
            p(50)
            return Promise.resolve()
          }}
        />
        <Toaster />
      </>
    ))
    return { c: view.container, got }
  }
  test('a non-CSV is refused with a Toast before anything else', async () => {
    const { c } = mount()
    const input = c.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'p.xlsx')],
      configurable: true,
    })
    fireEvent.change(input)
    await tick()
    expect(toasts()).toContain('That isn’t a CSV file')
    expect(c.querySelector('[data-scope="dropzone"]')).not.toBeNull()
  })
  test('upload → map → review → import, with bad cells inline and focus on each heading', async () => {
    const { c, got } = mount()
    byText(c, 'Use the sample').click()
    await tick()
    expect(document.activeElement!.tagName).toBe('H3')
    expect(c.querySelector('[data-part="step-title"]')!.textContent).toBe('Map people')
    expect([...c.querySelectorAll('tbody [role="combobox"]')].map((s) => s.textContent)).toEqual([
      'Full name',
      'Email',
      'Team',
      'Start date',
    ])
    byText(c, 'Preview').click()
    await tick()
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain('2 of 4 rows need a fix')
    expect([...c.querySelectorAll('td [data-part="error"]')].map((e) => e.textContent)).toEqual([
      'Not a valid email',
      'Use YYYY-MM-DD',
    ])
    expect(c.querySelectorAll('tr[data-invalid]').length).toBe(2)
    byText(c, 'Import 2 rows').click()
    await tick()
    expect((got[0] as { email: string }[]).map((r) => r.email)).toEqual([
      'ada@acme.dev',
      'kat@acme.dev',
    ])
    expect(c.textContent).toContain('2 people imported')
    expect(toasts()).toContain('2 people imported')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
  })
  test('with no column on Email, Review says so once and nothing can import', async () => {
    const { c } = mount()
    byText(c, 'Use the sample').click()
    await tick()
    pick(c.querySelectorAll<HTMLElement>('tbody [role="combobox"]')[1]!, 'Don’t import')
    await tick()
    byText(c, 'Preview').click()
    await tick()
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain(
      'No column is mapped to Email',
    )
    expect((byText(c, 'Import 0 rows') as HTMLButtonElement).disabled).toBe(true)
  })
})

test('CartDrawer: stepper, minus at one removes with Undo, Checkout', async () => {
  const cart = state<CartLine[]>([CART[0]!])
  const open = state(true)
  let went = 0
  render(() => (
    <>
      <CartDrawer open={open} cart={cart} onCheckout={() => went++} />
      <Toaster />
    </>
  ))
  await tick()
  const d = dialog()
  expect(d.querySelector('[data-part="title"]')!.textContent).toBe('Cart · 1 item')
  byText(d, 'More Field notebook, A5 dot grid').click()
  await tick()
  expect(cart.value[0]!.quantity).toBe(2)
  byText(d, 'Fewer Field notebook, A5 dot grid').click()
  await tick()
  byText(d, 'Remove Field notebook, A5 dot grid').click()
  await tick()
  expect(cart.value).toEqual([])
  byText(document.body, 'Undo').click()
  await tick()
  expect(cart.value.length).toBe(1)
  byText(d, 'Checkout').click()
  await tick()
  expect(went).toBe(1)
  expect(open.value).toBe(false)
})

registerCheckout()
