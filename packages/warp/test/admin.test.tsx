// The admin pack driven as a user would.
import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import type { CartLine } from '@weft-js/warp-core'
import { ApiKeys, type ApiKey } from '../src/admin/ApiKeys'
import { AuditLog } from '../src/admin/Audit'
import { Invoices, PayFrame, PaymentMethods } from '../src/admin/Billing'
import { CartDrawer } from '../src/admin/Cart'
import { Checkout, type PlaceOrderResult, type OrderDraft } from '../src/admin/Checkout'
import { CsvImport } from '../src/admin/CsvImport'
import { TypeToConfirm } from '../src/admin/Danger'
import { IntegrationsGrid, Webhooks, urlBreaks, type Integration } from '../src/admin/Integrations'
import { MembersTable, RolesMatrix, type Member } from '../src/admin/Members'
import { PlanPicker, UsageMeter } from '../src/admin/Plans'
import { SaveBar } from '../src/admin/SaveBar'
import { TagsInput } from '../src/admin/TagsInput'
import { Input } from '../src/Field'
import { Toaster } from '../src/Toast'
import { AUDIT, CART, CARDS, HOOKS, INTEGRATIONS, INVOICES, INVITES, KEYS, PEOPLE, PLANS, ROLES, SAMPLE, SHIPPING, TARGETS } from './fixtures/pack-admin'

const NOW = '2026-10-28T14:02:00Z'
const tick = async () => { await flush(); await new Promise(r => { setTimeout(r) }); await flush() }
const byText = (root: ParentNode, t: string) => [...root.querySelectorAll<HTMLElement>('button, a')].find(b => (b.querySelector('[data-part="sweep-label"]') ?? b).textContent?.trim() === t || b.getAttribute('aria-label') === t)!
const dialog = () => document.querySelector<HTMLDialogElement>('dialog[open]')!
const toasts = () => [...document.querySelectorAll('[data-scope="toast"][data-part="root"]')].map(t => t.querySelector('[data-part="title"]')!.textContent)
const type = (el: HTMLInputElement, v: string) => { el.value = v; fireEvent.input(el) }
const field = (root: ParentNode, label: string) => [...root.querySelectorAll('[data-scope="field"]')].find(f => f.querySelector('[data-part="label-text"]')?.textContent === label)!.querySelector<HTMLInputElement>('input, select')!

beforeAll(() => {
  (HTMLDialogElement.prototype as { showModal: (this: HTMLDialogElement) => void }).showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  ;(HTMLDialogElement.prototype as unknown as { close?: unknown }).close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})

const pick = (trigger: HTMLElement, label: string) => {
  trigger.click()
  ;[...trigger.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent!.startsWith(label))!.click()
}

describe('SaveBar', () => {
  const mount = (onSave: Parameters<typeof SaveBar<{ name: string }>>[0]['onSave'] = () => {}, validate?: (v: { name: string }) => Record<string, string>) => {
    const values = state({ name: 'Ines' })
    const errors = state<Record<string, string>>({})
    const view = render(() => <><form><Input label="Name" value={values.value.name} error={errors.value.name ?? ''} onInput={e => (values.value = { name: e.currentTarget.value })} /><SaveBar values={values} errors={errors} onSave={onSave} validate={validate} /></form><Toaster /></>)
    const bar = () => view.container.querySelector<HTMLElement>('[data-scope="save-bar"]')!
    return { values, errors, bar, c: view.container, input: view.container.querySelector<HTMLInputElement>('input')! }
  }
  test('rises when dirty, goes when the diff is undone, Discard restores', async () => {
    const { bar, input, values, c } = mount()
    expect(bar().hasAttribute('data-open')).toBe(false)
    type(input, 'Ada'); await tick()
    expect(bar().hasAttribute('data-open')).toBe(true)
    type(input, 'Ines'); await tick()
    expect(bar().hasAttribute('data-open')).toBe(false)
    type(input, 'Ada'); await tick()
    byText(c, 'Discard').click(); await tick()
    expect(values.value.name).toBe('Ines')
    expect(bar().hasAttribute('data-open')).toBe(false)
  })
  test('pending, then Saved, and the new values are the snapshot', async () => {
    let done!: () => void
    const { bar, input, c } = mount(() => new Promise<void>(r => { done = r }))
    type(input, 'Ada'); await tick()
    byText(c, 'Save changes').click(); await tick()
    expect(byText(c, 'Save changes').hasAttribute('data-loading')).toBe(true)
    done(); await tick()
    expect(bar().querySelector('[role="status"]')!.textContent).toBe('Saved')
    expect(bar().hasAttribute('data-open')).toBe(true)
  })
  test('field errors keep the bar and focus the first invalid field', async () => {
    const { bar, input, c } = mount(undefined, v => (v.name ? {} : { name: 'Add a name.' }))
    type(input, ''); await tick()
    byText(c, 'Save changes').click(); await tick()
    expect(bar().querySelector('[role="status"]')!.textContent).toBe('Fix 1 field to save')
    expect(document.activeElement).toBe(input)
  })
  test('a transport failure keeps the values and offers Retry', async () => {
    const { input, c } = mount(() => Promise.reject(new Error('net')))
    type(input, 'Ada'); await tick()
    byText(c, 'Save changes').click(); await tick()
    expect(toasts()).toContain('That didn’t save')
    expect(input.value).toBe('Ada')
  })
  test('a link press while dirty asks first', async () => {
    const left: string[] = []
    const values = state({ a: 1 })
    const view = render(() => <div><a href="/away">Away</a><SaveBar values={values} onSave={() => {}} onLeave={h => left.push(h)} /></div>)
    values.value = { a: 2 }; await tick()
    byText(view.container, 'Away').click(); await tick()
    expect(dialog().getAttribute('role')).toBe('alertdialog')
    expect(document.activeElement!.textContent).toContain('Stay')
    byText(dialog(), 'Discard and leave').click(); await tick()
    expect(left).toEqual(['/away'])
  })
})

test('TypeToConfirm: focus in the field, disabled until exact, Enter only then', async () => {
  const open = state(true)
  let n = 0
  render(() => <TypeToConfirm open={open} title="Delete?" confirmText="prod" action="Delete project" onConfirm={() => { n++ }} />)
  await tick()
  const input = dialog().querySelector('input')!
  expect(document.activeElement).toBe(input)
  expect(dialog().querySelector('[data-part="header"] [data-part="mark"]')?.getAttribute('data-tone')).toBe('critical')
  const go = byText(dialog(), 'Delete project') as HTMLButtonElement
  expect(go.disabled).toBe(true)
  type(input, 'Prod'); await tick()
  fireEvent.submit(input.closest('form')!); await tick()
  expect(n).toBe(0)
  type(input, 'prod'); await tick()
  expect(go.disabled).toBe(false)
  fireEvent.submit(input.closest('form')!); await tick()
  expect(n).toBe(1)
  expect(open.value).toBe(false)
})

test('TagsInput: Enter, comma, paste; invalid stays critical; Backspace highlights then removes', async () => {
  const value = state<string[]>([])
  const { container: c } = render(() => <><TagsInput label="Emails" value={value} valid={t => t.includes('@')} /><Toaster /></>)
  const input = c.querySelector<HTMLInputElement>('input')!
  type(input, 'a@x.dev'); fireEvent.keyDown(input, { key: 'Enter' }); await tick()
  type(input, 'nope'); fireEvent.keyDown(input, { key: ',' }); await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope'])
  fireEvent.paste(input, { clipboardData: { getData: () => 'b@x.dev, c@x.dev; a@x.dev' } }); await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope', 'b@x.dev', 'c@x.dev'])
  expect(c.querySelectorAll('[data-scope="tag"][data-tone="critical"]').length).toBe(1)
  fireEvent.keyDown(input, { key: 'Backspace' }); await tick()
  expect(c.querySelector('[data-highlighted]')!.textContent).toContain('c@x.dev')
  expect(value.value.length).toBe(4)
  fireEvent.keyDown(input, { key: 'Backspace' }); await tick()
  expect(value.value).toEqual(['a@x.dev', 'nope', 'b@x.dev'])
})

describe('MembersTable', () => {
  const mount = (seats = 10, members: Member[] = PEOPLE) => {
    const people = state<readonly Member[]>(members)
    const log: unknown[] = []
    const view = render(() => <><MembersTable members={people} invites={INVITES} me="ines" roles={ROLES} seats={seats} onRoleChange={(m, role) => { log.push(['role', m.id, role]); people.value = people.value.map(x => (x.id === m.id ? { ...x, role } : x)) }} onRemove={l => { log.push(['rm', l.map(m => m.id)]); people.value = people.value.filter(x => !l.some(y => y.id === x.id)) }} onRestore={l => { log.push(['back']); people.value = [...people.value, ...l] }} onInvite={(e, r) => { log.push(['inv', e, r]) }} /><Toaster /></>)
    return { c: view.container, log, people }
  }
  const select = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`tr[data-id="${id}"] [role="combobox"]`)!
  test('seats count pending invites', () => {
    expect(mount().c.textContent).toContain('5 of 10 seats used')
  })
  test('a role change applies at once with Undo', async () => {
    const { c, log } = mount()
    await tick()
    pick(select(c, 'tomas'), 'Viewer'); await tick()
    expect(log).toEqual([['role', 'tomas', 'viewer']])
    expect(toasts()).toContain('Tomás Reyes is now Viewer')
    byText(document.body, 'Undo').click(); await tick()
    expect(log.at(-1)).toEqual(['role', 'tomas', 'admin'])
  })
  test('the last owner can’t be demoted, and the select says why', async () => {
    const { c, log } = mount()
    await tick()
    const s = select(c, 'ines')
    expect(document.getElementById(s.getAttribute('aria-describedby')!)!.textContent).toMatch(/only owner/)
    pick(s, 'Viewer'); await tick()
    expect(s.textContent).toBe('Owner')
    expect(log).toEqual([])
  })
  test('demoting yourself warns', async () => {
    const { c, log } = mount(10, [PEOPLE[0], { ...PEOPLE[1], role: 'owner' }])
    await tick()
    pick(select(c, 'ines'), 'Member'); await tick()
    expect(dialog().textContent).toMatch(/lose access to this page/)
    expect(log).toEqual([])
    byText(dialog(), 'Change my role').click(); await tick()
    expect(log).toEqual([['role', 'ines', 'member']])
  })
  test('bulk: the bar counts who can go, one dialog, one Undo for the batch', async () => {
    const { c, log, people } = mount()
    for (const id of ['ines', 'priya', 'jonas']) c.querySelector<HTMLInputElement>(`tr[data-id="${id}"] [data-part="select"] input`)!.click()
    await tick()
    byText(c, 'Remove 2 members').click(); await tick()
    byText(dialog(), 'Remove 2 members').click(); await tick()
    expect(log).toEqual([['rm', ['priya', 'jonas']]])
    expect(toasts()).toContain('2 members removed')
    byText(document.body, 'Undo').click(); await tick()
    expect(people.value.length).toBe(4)
  })
  test('invite: paste, invalid tag and seat check block sending, one message', async () => {
    const { c, log } = mount(6)
    byText(c, 'Invite people').click(); await tick()
    const d = dialog()
    const input = d.querySelector<HTMLInputElement>('input')!
    fireEvent.paste(input, { clipboardData: { getData: () => 'a@x.dev, nope' } }); await tick()
    byText(d, 'Send invites').click(); await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/“nope” isn't a valid email/)
    byText(d, 'Remove nope').click(); await tick()
    type(input, 'b@x.dev'); fireEvent.keyDown(input, { key: 'Enter' }); await tick()
    byText(d, 'Send invites').click(); await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/You have 1 seat left. Remove 1/)
    byText(d, 'Remove b@x.dev').click(); await tick()
    byText(d, 'Send invites').click(); await tick()
    expect(log).toEqual([['inv', ['a@x.dev'], 'admin']].map(x => [x[0], x[1], 'member']))
    expect(toasts()).toContain('Invite sent')
  })
})

test('RolesMatrix says yes and no in words', () => {
  const { container: c } = render(() => <RolesMatrix roles={ROLES.slice(0, 2)} permissions={[{ id: 'a', label: 'Bill', roles: ['owner'] }]} />)
  expect(c.querySelector('tbody tr')!.textContent).toBe('BillYes–No')
})

describe('ApiKeys', () => {
  const mount = (over: Partial<Parameters<typeof ApiKeys>[0]> = {}) => {
    const keys = state<readonly ApiKey[]>(KEYS)
    const gone: string[] = []
    const view = render(() => <><ApiKeys keys={keys} now={NOW} onCreate={() => Promise.resolve('wk_test_SECRET')} onRevoke={k => { gone.push(k.id); keys.value = keys.value.filter(x => x !== k) }} {...over} /><Toaster /></>)
    return { c: view.container, gone }
  }
  test('re-auth first; refused stops', async () => {
    const asks: string[] = []
    const { c } = mount({ onReauth: r => { asks.push(r); return Promise.resolve(false) } })
    byText(c, 'Create test key').click(); await tick()
    expect(asks.length).toBe(1)
    expect(dialog()).toBeNull()
  })
  test('the key shows once and Done waits on the checkbox; Escape can’t lose it', async () => {
    const { c } = mount()
    byText(c, 'Create test key').click(); await tick()
    const d = dialog()
    byText(d, 'Create key').click(); await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/Name the key/)
    type(field(d, 'Key name'), 'CI deploys'); await tick()
    byText(d, 'Create key').click(); await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/already have/)
    type(field(d, 'Key name'), 'New'); await tick()
    byText(d, 'Create key').click(); await tick()
    expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('wk_test_SECRET')
    const done = byText(d, 'Done') as HTMLButtonElement
    expect(done.disabled).toBe(true)
    fireEvent(d, new Event('cancel', { cancelable: true })); await tick()
    expect(d.open).toBe(true)
    d.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await tick()
    expect(done.disabled).toBe(false)
    done.click(); await tick()
    expect(d.textContent).not.toContain('wk_test_SECRET')
  })
  test('revoke is type-to-confirm when used in the last day, a plain alert otherwise', async () => {
    const { c, gone } = mount()
    byText(c, 'Revoke Metrics export').click(); await tick()
    expect(dialog().querySelector('input')).toBeNull()
    byText(dialog(), 'Revoke key').click(); await tick()
    expect(gone).toEqual(['k2'])
    byText(c, 'Revoke CI deploys').click(); await tick()
    const d = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)!
    expect((byText(d, 'Revoke key') as HTMLButtonElement).disabled).toBe(true)
    type(d.querySelector('input')!, 'CI deploys'); await tick()
    byText(d, 'Revoke key').click(); await tick()
    expect(gone).toEqual(['k2', 'k1'])
  })
})

describe('PlanPicker', () => {
  test('arrow-picking only compares; the primary opens proration; a decline keeps the dialog', async () => {
    let answer: string | undefined = 'Your card was declined.'
    const asked: unknown[] = []
    const { container: c } = render(() => <><PlanPicker plans={PLANS} current="team" seats={9} daysLeft={9} onChange={(p, i) => { asked.push([p.id, i]); return answer }} /><Toaster /></>)
    const radio = c.querySelector<HTMLInputElement>('input[value="scale"]')!
    radio.click(); await tick()
    expect(dialog()).toBeNull()
    byText(c, 'Upgrade to Scale').click(); await tick()
    const d = dialog()
    expect(d.querySelector('[data-part="total"]')!.textContent).toBe('Due today$108')
    byText(d, 'Confirm upgrade').click(); await tick()
    expect(d.querySelector('[role="alert"]')!.textContent).toContain('declined')
    answer = undefined
    byText(d, 'Confirm upgrade').click(); await tick()
    expect(asked).toEqual([['scale', 'month'], ['scale', 'month']])
    expect(toasts()).toContain('You’re on Scale')
  })
  test('annual shows the per-month price; downgrades list what stops', async () => {
    const { container: c } = render(() => <PlanPicker plans={PLANS} current="team" seats={9} daysLeft={9} losses={() => ['Preview environments']} onChange={() => {}} />)
    c.querySelector<HTMLInputElement>('input[value="year"]')!.click(); await tick()
    expect(c.querySelector('[data-scope="plan-card"]:nth-child(2) [data-part="price"]')!.textContent).toBe('$19per seat / month, billed yearly')
    c.querySelector<HTMLInputElement>('input[value="starter"]')!.click(); await tick()
    byText(c, 'Switch to Starter').click(); await tick()
    expect(dialog().textContent).toContain('Preview environments')
    expect(dialog().querySelector('[data-part="total"]')!.textContent).toContain('Due next period')
  })
})

test('UsageMeter: tones, tick and overage', () => {
  const { container: c } = render(() => <><UsageMeter label="A" value={50} limit={100} /><UsageMeter label="B" value={85} limit={100} /><UsageMeter label="C" value={125} limit={100} overage="+ $12.40 overage" /></>)
  const m = [...c.querySelectorAll<HTMLElement>('[data-scope="meter"]')]
  expect(m.map(x => x.dataset.tone)).toEqual([undefined, 'caution', 'critical'])
  expect(m[2]!.querySelector('[data-part="over"]')).not.toBeNull()
  expect(m[2]!.querySelector('[data-part="note"]')!.textContent).toBe('+ $12.40 overage')
  expect(m[0]!.querySelector('[role="meter"]')!.getAttribute('aria-valuetext')).toBe('50 of 100')
})

test('Invoices pin a banner on a failed payment; PaymentMethods give Undo', async () => {
  const fix: number[] = []
  const back: string[] = []
  const { container: c } = render(() => <><Invoices invoices={[...INVOICES, { id: 'x', date: 'Jul 1', number: 'INV-1', status: 'failed', amount: 9 }]} onUpdatePayment={() => fix.push(1)} /><PaymentMethods methods={CARDS} onDefault={() => {}} onRemove={() => {}} onRestore={m => back.push(m.id)} /><Toaster /></>)
  byText(c, 'Update payment method').click()
  expect(fix).toEqual([1])
  byText(c, 'Remove Mastercard ending 5100').click(); await tick()
  byText(document.body, 'Undo').click()
  expect(back).toEqual(['m'])
})

test('PayFrame: a titled iframe slot with a shimmer until it loads, never a card field', async () => {
  const { container: c } = render(() => <PayFrame title="Card fields" src="about:blank" testMode />)
  const f = c.querySelector('[data-scope="pay-frame"]')!
  expect(f.getAttribute('aria-busy')).toBe('true')
  expect(c.querySelector('iframe')!.title).toBe('Card fields')
  fireEvent.load(c.querySelector('iframe')!); await tick()
  expect(f.hasAttribute('data-state')).toBe(false)
  expect(c.querySelectorAll('input').length).toBe(0)
})

describe('AuditLog', () => {
  test('a filter change is announced', async () => {
    const { container: c } = render(() => <><AuditLog events={AUDIT} now={NOW} categories={[{ value: 'all', label: 'All' }, { value: 'keys', label: 'Keys' }]} /><Toaster /></>)
    c.querySelectorAll<HTMLInputElement>('[data-scope="segmented"] input')[1]!.click()
    await flush(); await new Promise(r => { setTimeout(r, 80) })
    expect(c.querySelector('[data-scope="announcer"]')!.textContent).toMatch(/\d+ events? shown/)
  })
  test('filters, exact time on hover, and the rate limit counts down on the button', async () => {
    vi.useFakeTimers()
    try {
      const { container: c } = render(() => <><AuditLog events={AUDIT} now={NOW} categories={[{ value: 'all', label: 'All' }, { value: 'keys', label: 'Keys' }]} onExport={() => Promise.resolve({ retryAfter: 2 })} /><Toaster /></>)
      const rows = () => c.querySelectorAll('tbody tr[data-id]').length
      expect(rows()).toBe(3)
      expect(c.querySelector('time')!.textContent).toBe('4 min ago')
      expect(c.querySelector('time')!.nextElementSibling!.textContent).toBe('2026-10-28 13:58 UTC')
      c.querySelector<HTMLInputElement>('input[value="keys"]')!.click(); await flush()
      expect(rows()).toBe(1)
      const s = field(c, 'Date range') as unknown as HTMLSelectElement
      c.querySelector<HTMLInputElement>('input[value="all"]')!.click(); await flush()
      s.value = '24h'; fireEvent.change(s); await flush()
      expect(rows()).toBe(2)
      byText(c, 'Export CSV').click(); await vi.advanceTimersByTimeAsync(0); await flush()
      const b = byText(c, 'Try again in 2s')
      expect(b.getAttribute('aria-disabled')).toBe('true')
      await vi.advanceTimersByTimeAsync(2000); await flush()
      expect(b.querySelector('[data-part="sweep-label"]')!.textContent).toBe('Export CSV')
    } finally { vi.useRealTimers() }
  })
})

describe('Integrations', () => {
  test('one action per state; a critical solid only on the failing card; Connect lists, then leaves', async () => {
    const items = state<readonly Integration[]>(INTEGRATIONS)
    const went: string[] = []
    const { container: c } = render(() => <div><IntegrationsGrid items={items} onConnect={x => { went.push(x.id); items.value = items.value.map(i => (i.id === x.id ? { ...i, state: 'pending' } : i)) }} onDisconnect={() => {}} /><Toaster /></div>)
    expect(c.querySelector('[data-state="error"] button')!.getAttribute('data-tone')).toBe('critical')
    byText(c.querySelector('li[data-state="off"]')!, 'Connect').click(); await tick()
    expect(dialog().textContent).toContain('Comment on issues')
    expect(went).toEqual([])
    byText(dialog(), 'Continue to Linear').click(); await tick()
    expect(went).toEqual(['linear'])
    expect(c.querySelector('li[data-state="pending"]')!.textContent).toContain('Connecting')
    items.value = items.value.map(i => (i.id === 'linear' ? { ...i, state: 'connected', detail: 'acme' } : i)); await tick()
    expect(toasts()).toContain('Linear connected')
    expect(document.activeElement!.querySelector('[data-part="sweep-label"]')?.textContent ?? document.activeElement!.textContent).toBe('Configure')
  })
  test('a webhook URL offers breaks after slashes and before dots, never inside a word', () => {
    expect(urlBreaks('https://hooks.acme.dev/deploys/v2?team=web&x=1')).toEqual(['https://', 'hooks', '.acme', '.dev/', 'deploys/', 'v2', '?team=', 'web&', 'x=', '1'])
    const { container: c } = render(() => <Webhooks hooks={HOOKS} events={['a.b']} onAdd={async () => 'whsec_1'} onTest={async () => ({ status: 200, ms: 1 })} />)
    const code = c.querySelector<HTMLElement>('[data-part="url"]')!
    expect(code.textContent).toBe(HOOKS[0].url)
    expect(code.querySelectorAll('wbr').length).toBe(urlBreaks(HOOKS[0].url).length - 1)
    expect(code.style.overflowWrap).toBe('break-word') // was anywhere: a URL broke mid-word
    expect(code.style.wordBreak).toBe('normal')
  })
  test('webhooks: https checked on submit then live; the secret once; Send test reports', async () => {
    const added: unknown[] = []
    const { container: c } = render(() => <><Webhooks hooks={HOOKS} events={['a.b', 'c.d']} onAdd={(u, e) => { added.push([u, e]); return Promise.resolve('whsec_1') }} onTest={() => Promise.resolve({ status: 200, ms: 82 })} /><Toaster /></>)
    byText(c, 'Send test to https://hooks.acme.dev/deploys').click(); await tick()
    expect(toasts()).toContain('Test delivered: 200')
    byText(c, 'Add endpoint').click(); await tick()
    const d = dialog()
    const url = d.querySelector<HTMLInputElement>('input[type="url"]')!
    type(url, 'http://x.dev'); await tick()
    expect(d.querySelector('[data-part="error"]')).toBeNull()
    byText(d, 'Add endpoint').click(); await tick()
    expect(d.querySelector('[data-part="error"]')!.textContent).toMatch(/https/)
    type(url, 'https://x.dev/h'); await tick()
    expect(d.querySelector('[data-part="error"]')).toBeNull()
    byText(d, 'Add endpoint').click(); await tick()
    expect(added).toEqual([['https://x.dev/h', ['a.b', 'c.d']]])
    expect(d.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('whsec_1')
  })
})

describe('CsvImport', () => {
  const mount = () => {
    const got: unknown[] = []
    const view = render(() => <><CsvImport targets={TARGETS} sample={SAMPLE} onImport={(r, p) => { got.push(r); p(50); return Promise.resolve() }} /><Toaster /></>)
    return { c: view.container, got }
  }
  test('a non-CSV is refused with a Toast before anything else', async () => {
    const { c } = mount()
    const input = c.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.xlsx')], configurable: true })
    fireEvent.change(input); await tick()
    expect(toasts()).toContain('That isn’t a CSV file')
    expect(c.querySelector('[data-scope="dropzone"]')).not.toBeNull()
  })
  test('upload → map → review → import, with bad cells inline and focus on each heading', async () => {
    const { c, got } = mount()
    byText(c, 'Use the sample').click(); await tick()
    expect(document.activeElement!.tagName).toBe('H3')
    expect(c.querySelector('[data-part="step-title"]')!.textContent).toBe('Map people')
    expect([...c.querySelectorAll('tbody [role="combobox"]')].map(s => s.textContent)).toEqual(['Full name', 'Email', 'Team', 'Start date'])
    byText(c, 'Preview').click(); await tick()
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain('2 of 4 rows need a fix')
    expect([...c.querySelectorAll('td [data-part="error"]')].map(e => e.textContent)).toEqual(['Not a valid email', 'Use YYYY-MM-DD'])
    expect(c.querySelectorAll('tr[data-invalid]').length).toBe(2)
    byText(c, 'Import 2 rows').click(); await tick()
    expect((got[0] as { email: string }[]).map(r => r.email)).toEqual(['ada@acme.dev', 'kat@acme.dev'])
    expect(c.textContent).toContain('2 people imported')
    expect(toasts()).toContain('2 people imported')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100')
  })
  test('with no column on Email, Review says so once and nothing can import', async () => {
    const { c } = mount()
    byText(c, 'Use the sample').click(); await tick()
    pick(c.querySelectorAll<HTMLElement>('tbody [role="combobox"]')[1], 'Don’t import'); await tick()
    byText(c, 'Preview').click(); await tick()
    expect(c.querySelector('[data-scope="alert"]')!.textContent).toContain('No column is mapped to Email')
    expect((byText(c, 'Import 0 rows') as HTMLButtonElement).disabled).toBe(true)
  })
})

test('CartDrawer: stepper, minus at one removes with Undo, Checkout', async () => {
  const cart = state<CartLine[]>([CART[0]!])
  const open = state(true)
  let went = 0
  render(() => <><CartDrawer open={open} cart={cart} onCheckout={() => went++} /><Toaster /></>)
  await tick()
  const d = dialog()
  expect(d.querySelector('[data-part="title"]')!.textContent).toBe('Cart · 1 item')
  byText(d, 'More Field notebook, A5 dot grid').click(); await tick()
  expect(cart.value[0]!.quantity).toBe(2)
  byText(d, 'Fewer Field notebook, A5 dot grid').click(); await tick()
  byText(d, 'Remove Field notebook, A5 dot grid').click(); await tick()
  expect(cart.value).toEqual([])
  byText(document.body, 'Undo').click(); await tick()
  expect(cart.value.length).toBe(1)
  byText(d, 'Checkout').click(); await tick()
  expect(went).toBe(1)
  expect(open.value).toBe(false)
})

describe('Checkout', () => {
  const mount = (place: (o: OrderDraft) => Promise<PlaceOrderResult>, key?: string) => {
    const cart = state<CartLine[]>(CART)
    const steps: string[] = []
    const view = render(() => <><Checkout cart={cart} shipping={SHIPPING} countries={['US', 'GB', 'DE']} taxRate={0.1} idempotencyKey={key} coupon={c => (c === 'WARP10' ? { code: c, percentOff: 10 } : undefined)} payment={<PayFrame title="Card" testMode />} onPlaceOrder={place} onStepChange={s => steps.push(s)} /><Toaster /></>)
    return { c: view.container, cart, steps }
  }
  const active = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-state="active"]')!.dataset.step
  const toReview = async (c: HTMLElement) => {
    byText(c, 'Continue to address').click(); await tick()
    const s = c.querySelector<HTMLElement>('[data-step="address"]')!
    type(field(s, 'Full name'), 'Ines'); type(field(s, 'Email for receipt'), 'ines@acme.dev')
    type(field(s, 'Street address'), '1 Main'); type(field(s, 'City'), 'SF'); type(field(s, 'State'), 'CA'); type(field(s, 'ZIP code'), '94107'); await tick()
    fireEvent.submit(s.querySelector('form')!); await tick()
    byText(c, 'Continue to payment').click(); await tick()
    byText(c, 'Review order').click(); await tick()
  }
  test('the address step keeps errors at the source, by country, and focuses the first', async () => {
    const { c } = mount(() => Promise.resolve({ order: { id: 'A' } }))
    byText(c, 'Continue to address').click(); await tick()
    expect(document.activeElement!.getAttribute('data-part')).toBe('step-title')
    const s = c.querySelector<HTMLElement>('[data-step="address"]')!
    fireEvent.submit(s.querySelector('form')!); await tick()
    expect(active(c)).toBe('address')
    expect(document.activeElement).toBe(field(s, 'Full name'))
    expect(s.querySelector('[data-scope="alert"]')!.textContent).toContain('fields need attention')
    type(field(s, 'ZIP code'), '123'); await tick()
    fireEvent.submit(s.querySelector('form')!); await tick()
    expect(s.textContent).toContain('A ZIP code is 5 digits')
  })
  test('a coupon applies as a chip with Undo and moves the total', async () => {
    const { c } = mount(() => Promise.resolve({ order: { id: 'A' } }))
    const sum = c.querySelector<HTMLElement>('[data-part="summary"]')!
    const total = () => sum.querySelector('[data-part="total"] dd')!.textContent
    expect(total()).toBe('$82.50')
    const code = field(sum, 'Discount code')
    type(code, 'nope'); fireEvent.submit(code.closest('form')!); await tick()
    expect(sum.querySelector('[data-part="error"]')!.textContent).toMatch(/isn’t valid/)
    type(code, 'warp10'); fireEvent.submit(code.closest('form')!); await tick()
    expect(total()).toBe('$74.25')
    byText(sum, 'Remove WARP10').click(); await tick()
    expect(total()).toBe('$82.50')
    byText(document.body, 'Undo').click(); await tick()
    expect(total()).toBe('$74.25')
  })
  test('review has Edit links; pay is single-flight, keyed, and ends on the confirmation', async () => {
    const orders: OrderDraft[] = []
    let finish!: (r: PlaceOrderResult) => void
    const { c, steps } = mount(o => { orders.push(o); return new Promise(r => { finish = r }) }, 'key-1')
    await toReview(c)
    byText(c, 'Edit delivery').click(); await tick()
    expect(active(c)).toBe('shipping')
    expect((document.activeElement as HTMLInputElement).value).toBe('std')
    byText(c, 'Continue to payment').click(); await tick()
    byText(c, 'Review order').click(); await tick()
    const pay = byText(c, 'Pay $82.50')
    pay.click(); pay.click(); await tick()
    expect(orders.length).toBe(1)
    expect(orders[0]!.idempotencyKey).toBe('key-1')
    expect(orders[0]!.address.postalCode).toBe('94107')
    expect(pay.hasAttribute('data-loading')).toBe(true)
    finish({ order: { id: 'A-2041' } }); await tick()
    expect(active(c)).toBe('done')
    expect(c.querySelector('[data-step="done"] h2')!.textContent).toBe('Order #A-2041 confirmed')
    expect(c.querySelector('[data-scope="tracker"] [aria-current="step"]')!.textContent).toBe('Placed')
    expect(c.querySelector('nav[data-scope="steps"]')).toBeNull()
    expect(steps.at(-1)).toBe('done')
  })
  test('errors return to where they can be fixed; a timeout retries with the same key', async () => {
    const answers: (PlaceOrderResult | Error)[] = [new Error('timeout'), { error: { code: 'CARD_DECLINED', reason: 'The bank said no.' } }, { error: { code: 'PRICE_CHANGED', total: 90 } }, { error: { code: 'OUT_OF_STOCK', sku: 'b' } }]
    const keys: string[] = []
    const { c } = mount(o => { keys.push(o.idempotencyKey); const a = answers.shift()!; return a instanceof Error ? Promise.reject(a) : Promise.resolve(a) })
    await toReview(c)
    byText(c, 'Pay $82.50').click(); await tick()
    expect(active(c)).toBe('review')
    expect(toasts()).toContain('We couldn’t reach the store')
    byText(document.body, 'Retry').click(); await tick()
    expect(keys[1]).toBe(keys[0])
    expect(active(c)).toBe('payment')
    expect(c.querySelector('[data-step="payment"] [role="alert"]')!.textContent).toContain('The bank said no.')
    byText(c, 'Review order').click(); await tick()
    byText(c, 'Pay $82.50').click(); await tick()
    expect(keys[2]).not.toBe(keys[1])
    expect(active(c)).toBe('review')
    expect(c.querySelector('[data-step="review"]')!.textContent).toContain('The total is now $90')
    byText(c, 'Pay $90').click(); await tick()
    expect(active(c)).toBe('cart')
    expect(c.querySelector('[data-id="b"]')!.textContent).toContain('Out of stock')
    expect((byText(c, 'Continue to address') as HTMLButtonElement).disabled).toBe(true)
  })
})
