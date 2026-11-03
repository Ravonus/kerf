// The admin pack on the a11y gallery (?part=admin): rendered by test/a11y/gallery.tsx. Fixtures import per file.
import type { CartLine } from '@weft-js/warp-core'
import { state, type State } from '@weft-js/core'
import { ApiKeys, type ApiKey } from '../../src/admin/ApiKeys'
import { AuditLog, type AuditEvent } from '../../src/admin/Audit'
import { Invoices, PayFrame, PaymentMethods, type Invoice, type PaymentMethod } from '../../src/admin/Billing'
import { CartButton, CartDrawer } from '../../src/admin/Cart'
import { Checkout, type PlaceOrderResult } from '../../src/admin/Checkout'
import { CsvImport } from '../../src/admin/CsvImport'
import { ConfirmDialog, DangerZone, TypeToConfirm } from '../../src/admin/Danger'
import { IntegrationsGrid, Webhooks, type Integration, type Webhook } from '../../src/admin/Integrations'
import { InviteDialog } from '../../src/admin/InviteDialog'
import { MembersTable, RolesMatrix, SeatsMeter, type Invite, type Member, type Role } from '../../src/admin/Members'
import { OrderConfirmation } from '../../src/admin/Order'
import { PlanPicker, UsageMeter, UsageMeters, type BillingPlan } from '../../src/admin/Plans'
import { SaveBar, type FieldErrors } from '../../src/admin/SaveBar'
import { SettingRow, SettingsLayout, SettingsSection } from '../../src/admin/Settings'
import { Button } from '../../src/Button'
import { Switch } from '../../src/Choice'
import { Input } from '../../src/Field'
import { Tabs } from '../../src/Tabs'
import { Toaster } from '../../src/Toast'

const NOW = '2026-10-28T14:02:00Z'
export const ROLES: Role[] = [{ value: 'owner', label: 'Owner', manages: true }, { value: 'admin', label: 'Admin', manages: true }, { value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }]
export const PEOPLE: Member[] = [
  { id: 'ines', name: 'Ines Okafor', email: 'ines@acme.dev', role: 'owner', lastActive: 'Active now' },
  { id: 'tomas', name: 'Tomás Reyes', email: 'tomas@acme.dev', role: 'admin', lastActive: '2 h ago' },
  { id: 'priya', name: 'Priya Shah', email: 'priya@acme.dev', role: 'member', lastActive: 'Yesterday' },
  { id: 'jonas', name: 'Jonas Berg', email: 'jonas@acme.dev', role: 'viewer', lastActive: 'Oct 12' },
]
export const INVITES: Invite[] = [{ id: 'lee', email: 'lee@contractors.io', role: 'member', sent: '2 days ago' }]
export const KEYS: ApiKey[] = [
  { id: 'k1', name: 'CI deploys', prefix: 'wk_test_8c2f', scopes: ['deploy'], created: 'Sep 30', lastUsed: '2026-10-28T13:59:00Z' },
  { id: 'k2', name: 'Metrics export', prefix: 'wk_test_41ab', scopes: ['read'], created: 'Aug 2', lastUsed: '2026-10-01T10:00:00Z' },
]
export const PLANS: BillingPlan[] = [
  { id: 'starter', name: 'Starter', price: 0, description: 'For side projects.', features: ['3 seats', '10k API requests / mo', '5 GB storage'] },
  { id: 'team', name: 'Team', price: 24, description: 'For product teams.', features: ['10 seats', '50k API requests / mo', '10 GB storage', 'Preview environments'] },
  { id: 'scale', name: 'Scale', price: 64, description: 'For many teams.', features: ['50 seats', '250k API requests / mo', '100 GB storage', 'SSO, audit log export'] },
]
export const INVOICES: Invoice[] = [
  { id: '192', date: 'Oct 1', number: 'INV-0192', status: 'paid', amount: 216, pdf: '#inv' },
  { id: '171', date: 'Sep 1', number: 'INV-0171', status: 'paid', amount: 216, pdf: '#inv' },
  { id: '150', date: 'Aug 1', number: 'INV-0150', status: 'retrying', amount: 192, pdf: '#inv' },
]
export const CARDS: PaymentMethod[] = [{ id: 'v', brand: 'Visa', last4: '4242', expires: '08/28', default: true }, { id: 'm', brand: 'Mastercard', last4: '5100', expires: '02/27' }]
export const AUDIT: AuditEvent[] = [
  { id: 'a1', at: '2026-10-28T13:58:00Z', actor: 'Ines Okafor', category: 'keys', verb: 'created API key', target: 'CI deploys', href: '#key', ip: '84.12.3.9' },
  { id: 'a2', at: '2026-10-28T12:40:00Z', actor: 'Tomás Reyes', category: 'members', verb: 'changed role of', target: 'Priya Shah', ip: '10.4.0.22', diff: [{ field: 'Role', from: 'Admin', to: 'Member' }] },
  { id: 'a3', at: '2026-10-20T09:12:00Z', actor: 'Ines Okafor', category: 'billing', verb: 'upgraded plan to', target: 'Team (annual)', ip: '84.12.3.9' },
]
export const INTEGRATIONS: Integration[] = [
  { id: 'github', name: 'GitHub', summary: 'Deploy on push, status checks on PRs.', state: 'connected', detail: 'acme-org · 12 repos', can: ['Read deploys and their status'] },
  { id: 'slack', name: 'Slack', summary: 'Deploy and incident messages in a channel.', state: 'error', detail: 'Token expired Oct 26', can: ['Post to the channel you pick'] },
  { id: 'linear', name: 'Linear', summary: 'Link deploys to issues.', state: 'off', can: ['Read deploys and their status', 'Comment on issues'] },
]
export const HOOKS: Webhook[] = [{ id: 'h1', url: 'https://hooks.acme.dev/deploys', events: ['deploy.succeeded', 'deploy.failed'], lastDelivery: '200 · 4 min ago', healthy: true }]
export const CART: CartLine[] = [
  { id: 'a', name: 'Field notebook, A5 dot grid', variant: 'Graphite · 3-pack', price: 24, quantity: 1 },
  { id: 'b', name: 'Weft canvas tote', variant: 'Natural', price: 38, quantity: 1 },
  { id: 'c', name: 'Loom pen, 0.5 mm', variant: 'Black', price: 6.5, quantity: 2 },
]
export const SHIPPING = [{ id: 'std', name: 'Standard', eta: 'Arrives Thu 6 Nov', price: 0 }, { id: 'exp', name: 'Express', eta: 'Arrives Mon 3 Nov', price: 12 }]
export const TARGETS = [
  { id: 'name', label: 'Full name', aliases: ['name'] },
  { id: 'email', label: 'Email', required: true, check: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Not a valid email') },
  { id: 'team', label: 'Team' },
  { id: 'start', label: 'Start date', aliases: ['start'], check: (v: string) => (/^\d{4}-\d\d-\d\d$/.test(v) ? undefined : 'Use YYYY-MM-DD') },
]
export const SAMPLE = { name: 'people.csv', text: 'Name,Email,Team,Start\nAda Byron,ada@acme.dev,Platform,2026-11-03\nGrace H.,grace@acme,Platform,2026-11-03\nAlan T.,alan@acme.dev,Research,11/10/2026\nKat J.,kat@acme.dev,Design,2026-11-17\n' }
const PERMISSIONS = [{ id: 'deploy', label: 'Edit projects and deploy', roles: ['owner', 'admin', 'member'] }, { id: 'invite', label: 'Invite and remove members', roles: ['owner', 'admin'] }, { id: 'billing', label: 'Change billing and plan', roles: ['owner'] }]
const CATEGORIES = [{ value: 'all', label: 'All' }, { value: 'members', label: 'Members' }, { value: 'keys', label: 'Keys' }, { value: 'billing', label: 'Billing' }]
const NAV = [{ id: 'profile', label: 'Profile' }, { id: 'notify', label: 'Notifications' }, { id: 'danger', label: 'Danger zone', tone: 'critical' as const }]

const param = (name: string) => typeof location === 'object' && new URLSearchParams(location.search).has(name)

export function SettingsCase() {
  const values = state({ name: 'Ines Okafor', handle: 'ines' })
  const errors = state<FieldErrors>({})
  const section = state('profile')
  const del = state(param('delete'))
  const arc = state(param('archive'))
  return (
    <SettingsLayout sections={NAV} current={section.value} onNavigate={id => (section.value = id)}>
      <SettingsSection id="profile" title="Profile" description="How you appear to people in Fieldwork.">
        <SettingRow layout="stack">
          <div data-part="cols">
            <Input label="Display name" value={values.value.name} error={errors.value.name ?? ''} onInput={e => (values.value = { ...values.value, name: e.currentTarget.value })} />
            <Input label="Username" value={values.value.handle} error={errors.value.handle ?? ''} onInput={e => (values.value = { ...values.value, handle: e.currentTarget.value })} />
          </div>
        </SettingRow>
      </SettingsSection>
      <SettingsSection id="notify" title="Notifications" description="Choose what reaches you outside the app.">
        <SettingRow title="Mentions" description="When someone mentions you in a comment or review.">
          {(ids: { label: string; description: string }) => <Switch size="sm" checked aria-labelledby={ids.label} aria-describedby={ids.description} />}
        </SettingRow>
      </SettingsSection>
      <DangerZone description="These change who can reach fieldwork-prod. Some can’t be undone.">
        <SettingRow title="Archive project" description="Stops deploys and makes it read-only. You can restore it."><Button emphasis="frame" size="sm" onClick={() => (arc.value = true)}>Archive</Button></SettingRow>
        <SettingRow title="Delete project" description="Deletes fieldwork-prod, 3 environments and 214 deploys for good."><Button emphasis="soft" tone="critical" size="sm" onClick={() => (del.value = true)}>Delete project…</Button></SettingRow>
      </DangerZone>
      <SaveBar values={values} errors={errors} validate={v => (v.name ? {} : { name: 'Add a name people will recognise.' })} onSave={() => {}} />
      <TypeToConfirm open={del} title="Delete fieldwork-prod?" description="This permanently deletes the project and everything in it." confirmText="fieldwork-prod" items={['3 environments and their secrets', '214 deploys and their logs']} action="Delete project" onConfirm={() => {}} />
      <ConfirmDialog open={arc} title="Archive fieldwork-prod?" description="Deploys stop. You can restore it." action="Archive" onConfirm={() => {}} />
    </SettingsLayout>
  )
}

export function MembersCase() {
  const people = state<readonly Member[]>(PEOPLE)
  const invites = state<readonly Invite[]>(INVITES)
  return (
    <MembersTable
      members={people} invites={invites} me="ines" roles={ROLES} seats={10}
      onRoleChange={(m, role) => (people.value = people.value.map(x => (x.id === m.id ? { ...x, role } : x)))}
      onRemove={list => { people.value = people.value.filter(x => !list.includes(x)) }}
      onRestore={list => (people.value = [...people.value, ...list])}
      onInvite={(emails, role) => { invites.value = [...invites.value, ...emails.map(e => ({ id: e, email: e, role, sent: 'just now' }))] }}
      onRevoke={v => (invites.value = invites.value.filter(x => x !== v))}
    />
  )
}

export const RolesCase = () => <RolesMatrix roles={ROLES} permissions={PERMISSIONS} />
export const SeatsCase = () => <SeatsMeter used={7} total={10} />

export function KeysCase() {
  const keys = state<readonly ApiKey[]>(KEYS)
  return <ApiKeys keys={keys} now={NOW} onCreate={async d => { keys.value = [{ id: d.name, name: d.name, prefix: 'wk_test_77aa', scopes: d.scopes, created: 'Today' }, ...keys.value]; return 'wk_test_77aaSECRET' }} onRevoke={k => { keys.value = keys.value.filter(x => x !== k) }} />
}

export const PlansCase = () => <PlanPicker plans={PLANS} current="team" seats={9} daysLeft={9} onChange={() => {}} />

export const UsageCase = () => (
  <UsageMeters>
    <UsageMeter label="API requests" value={41200} limit={50000} format={n => n.toLocaleString('en-US')} note="Requests over the limit are slowed, never dropped." />
    <UsageMeter label="Seats" value={4} limit={10} />
    <UsageMeter label="Storage" value={11.2} limit={10} format={n => `${n} GB`} overage="+ $12.40 overage" />
  </UsageMeters>
)

export function BillingCase() {
  const cards = state<readonly PaymentMethod[]>(CARDS)
  return (
    <div data-scope="stack">
      <Invoices invoices={[...INVOICES, { id: '9', date: 'Jul 1', number: 'INV-0129', status: 'failed', amount: 192 }]} onExport={() => {}} />
      <PaymentMethods methods={cards} onAdd={() => {}} onDefault={m => (cards.value = cards.value.map(c => ({ ...c, default: c.id === m.id })))} onRemove={m => (cards.value = cards.value.filter(c => c !== m))} />
      <PayFrame title="Card fields from your payment provider" testMode />
    </div>
  )
}

export const AuditCase = () => <AuditLog events={AUDIT} now={NOW} categories={CATEGORIES} live="live" onExport={async () => ({ retryAfter: 20 })} />

export function IntegrationsCase() {
  const items = state<readonly Integration[]>(INTEGRATIONS)
  const hooks = state<readonly Webhook[]>(HOOKS)
  return (
    <div data-scope="stack">
      <IntegrationsGrid items={items} onConnect={x => (items.value = items.value.map(i => (i.id === x.id ? { ...i, state: 'pending' as const } : i)))} onDisconnect={x => (items.value = items.value.map(i => (i.id === x.id ? { ...i, state: 'off' as const } : i)))} />
      <Webhooks hooks={hooks} events={['deploy.succeeded', 'deploy.failed', 'member.added']} onAdd={async () => 'whsec_123'} onTest={async () => ({ status: 200, ms: 82 })} />
    </div>
  )
}

export const ImportCase = () => <CsvImport targets={TARGETS} sample={SAMPLE} onImport={async (_, p) => p(100)} />

const pay = (lines: State<CartLine[]>) => async (): Promise<PlaceOrderResult> => { lines.value = lines.value; return { order: { id: 'A-2041' } } }

export function CartCase() {
  const cart = state<CartLine[]>(CART)
  const open = state(param('cart'))
  return <><CartButton count={cart.value.reduce((n, l) => n + l.quantity, 0)} onClick={() => (open.value = true)} /><CartDrawer open={open} cart={cart} onCheckout={() => {}} /></>
}

export function CheckoutCase() {
  const cart = state<CartLine[]>(CART)
  return <Checkout cart={cart} shipping={SHIPPING} countries={['US', 'GB', 'DE']} taxRate={0.08} coupon={c => (c === 'WARP10' ? { code: c, percentOff: 10 } : undefined)} payment={<PayFrame title="Card fields from your payment provider" testMode />} wallet={{ label: 'Pay with saved wallet', onClick: () => {} }} onPlaceOrder={pay(cart)} onContinueShopping={() => {}} />
}

export const ConfirmationCase = () => <OrderConfirmation orderId="A-2041" email="ines@acme.dev" stage="packed" note="Standard delivery." onTrack={() => {}} onContinue={() => {}} />

export const InviteCase = () => { const open = state(param('invite')); return <InviteDialog open={open} roles={ROLES.slice(1)} seatsLeft={3} defaultRole="member" onSend={() => {}} /> }

const TABS = [{ value: 'settings', label: 'Settings' }, { value: 'members', label: 'Members' }, { value: 'keys', label: 'API keys' }, { value: 'billing', label: 'Billing' }, { value: 'audit', label: 'Audit log' }, { value: 'integrations', label: 'Integrations' }, { value: 'import', label: 'Import' }, { value: 'shop', label: 'Shop' }]

/** One section per Tab, each rendered only when picked, so the page's ids stay unique and an open overlay is in view. */
export function Part() {
  const start = (typeof location === 'object' && new URLSearchParams(location.search).get('tab')) || 'settings'
  const tab = state(start)
  return (
    <>
      <h1>warp admin</h1>
      <div style="padding-inline:var(--warp-space-page)">
      <Tabs label="Admin sections" value={tab.value} onChange={v => (tab.value = v)} options={TABS}>
        {(v: string) => (v !== tab.value ? null : (
          <div data-scope="stack">
            <h2>{TABS.find(t => t.value === v)!.label}</h2>
            {v === 'settings' && <SettingsCase />}
            {v === 'members' && <><MembersCase /><RolesCase /><InviteCase /></>}
            {v === 'keys' && <KeysCase />}
            {v === 'billing' && <><PlansCase /><UsageCase /><BillingCase /></>}
            {v === 'audit' && <AuditCase />}
            {v === 'integrations' && <IntegrationsCase />}
            {v === 'import' && <ImportCase />}
            {v === 'shop' && <><CartCase /><CheckoutCase /><ConfirmationCase /></>}
          </div>
        ))}
      </Tabs>
      </div>
      <Toaster />
    </>
  )
}
