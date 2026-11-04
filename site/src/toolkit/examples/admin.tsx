import { state } from '@weft-js/core'
import {
  ApiKeys,
  AuditLog,
  Badge,
  Button,
  Card,
  CartButton,
  CartDrawer,
  Checkout,
  ConfirmDialog,
  CsvImport,
  DangerZone,
  Input,
  IntegrationsGrid,
  InviteDialog,
  Invoices,
  LineItem,
  MembersTable,
  OrderConfirmation,
  OrderTracker,
  PayFrame,
  PaymentMethods,
  PlanPicker,
  Row,
  RolesMatrix,
  SaveBar,
  SeatsMeter,
  Segmented,
  Select,
  SettingRow,
  SettingsLayout,
  SettingsSection,
  Stack,
  Switch,
  TagsInput,
  Text,
  Toaster,
  TypeToConfirm,
  UsageMeter,
  UsageMeters,
  Webhooks,
} from '@weft-js/warp'
import type {
  ApiKey,
  Integration,
  Invite,
  Member,
  OrderStage,
  PaymentMethod,
  Permission,
  PlaceOrderResult,
  Webhook,
} from '@weft-js/warp'
import {
  API_KEYS,
  AUDIT,
  AUDIT_CATEGORIES,
  BILLS,
  CARDS,
  IMPORT_SAMPLE,
  IMPORT_TARGETS,
  INTEGRATIONS,
  INVITE_ROLES,
  NOW,
  OVERDUE_BILLS,
  PEOPLE,
  PLANS,
  SHOP_CART,
  SHOP_SHIPPING,
  TEAM_INVITES,
  TEAM_MEMBERS,
  TEAM_PERMISSIONS,
  TEAM_ROLES,
  WEBHOOKS,
  WEBHOOK_EVENTS,
} from '../world'

const wait = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms)
  })

// -- settings --

// A row only lays out side by side inside a `settings` container, which SettingsLayout normally provides.
const SettingsWidth = ({ children }: { children: unknown }) => (
  <div style="container: settings / inline-size">{children}</div>
)

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'deploys', label: 'Deploys' },
  { id: 'alerts', label: 'Notifications' },
  { id: 'project-danger', label: 'Danger zone', tone: 'critical' as const },
]
const REGIONS = [
  { value: 'eu-west', label: 'eu-west' },
  { value: 'us-east', label: 'us-east' },
  { value: 'ap-south', label: 'ap-south' },
]

export function SettingsLayoutProject() {
  const section = state('general')
  const previews = state(true)
  const failures = state(true)
  const archive = state(false)
  return (
    <SettingsLayout
      sections={SECTIONS}
      current={section.value}
      onNavigate={(id) => (section.value = id)}
    >
      <SettingsSection
        id="general"
        title="General"
        description="How storefront appears across weft."
      >
        <SettingRow layout="stack">
          <Input label="Project name" defaultValue="storefront" />
        </SettingRow>
        <SettingRow title="Region" description="Where its builds and logs live.">
          <Select label="Region" options={REGIONS} defaultValue="eu-west" />
        </SettingRow>
      </SettingsSection>
      <SettingsSection id="deploys" title="Deploys">
        <SettingRow title="Preview environments" description="Every pull request gets its own URL.">
          {(ids: { label: string; description: string }) => (
            <Switch
              size="sm"
              checked={previews.value}
              aria-labelledby={ids.label}
              aria-describedby={ids.description}
              onChange={() => (previews.value = !previews.value)}
            />
          )}
        </SettingRow>
      </SettingsSection>
      <SettingsSection id="alerts" title="Notifications">
        <SettingRow
          title="Failed deploys"
          description="Mail the project's owner when a deploy fails."
        >
          {(ids: { label: string; description: string }) => (
            <Switch
              size="sm"
              checked={failures.value}
              aria-labelledby={ids.label}
              aria-describedby={ids.description}
              onChange={() => (failures.value = !failures.value)}
            />
          )}
        </SettingRow>
      </SettingsSection>
      <DangerZone id="project-danger">
        <SettingRow title="Archive project" description="Stops deploys and makes it read-only.">
          <Button emphasis="soft" tone="critical" size="sm" onClick={() => (archive.value = true)}>
            Archive
          </Button>
        </SettingRow>
      </DangerZone>
      <ConfirmDialog
        open={archive}
        title="Archive storefront?"
        description="Deploys stop. You can restore it at any time."
        action="Archive project"
        onConfirm={() => wait(600)}
      />
    </SettingsLayout>
  )
}

export const SettingsLayoutTile = () => (
  <Stack style="inline-size:340px">
    <SettingsWidth>
      <SettingsSection id="tile-general" title="Deploys" description="How storefront ships.">
        <SettingRow title="Preview environments" description="A URL for every pull request.">
          <Switch size="sm" defaultChecked aria-label="Preview environments" />
        </SettingRow>
      </SettingsSection>
    </SettingsWidth>
  </Stack>
)

export const SettingsSectionNotifications = () => (
  <SettingsWidth>
    <SettingsSection id="mail" title="Email" description="Choose what reaches your inbox.">
      <SettingRow title="Weekly summary" description="Deploys, uptime and spend, every Monday.">
        {(ids: { label: string; description: string }) => (
          <Switch
            size="sm"
            defaultChecked
            aria-labelledby={ids.label}
            aria-describedby={ids.description}
          />
        )}
      </SettingRow>
      <SettingRow title="Product news" description="A few times a year.">
        {(ids: { label: string; description: string }) => (
          <Switch size="sm" aria-labelledby={ids.label} aria-describedby={ids.description} />
        )}
      </SettingRow>
    </SettingsSection>
  </SettingsWidth>
)

export const SettingRowControls = () => (
  <SettingsWidth>
    <SettingsSection
      id="row-kinds"
      title="Build"
      description="A control on the end, or stacked for a wide field."
    >
      <SettingRow title="Node version" description="Used for every build of this project.">
        <Select label="Node version" options={NODE_VERSIONS} defaultValue="26" />
      </SettingRow>
      <SettingRow title="Clear the build cache" description="The next build starts from nothing.">
        <Button emphasis="outline" tone="neutral" size="sm">
          Clear cache
        </Button>
      </SettingRow>
      <SettingRow layout="stack">
        <Input label="Build command" defaultValue="pnpm build" />
      </SettingRow>
    </SettingsSection>
  </SettingsWidth>
)

const NODE_VERSIONS = [
  { value: '26', label: 'Node 26' },
  { value: '24', label: 'Node 24' },
]

export function SaveBarProject() {
  const values = state({ name: 'storefront', branch: 'main' })
  const errors = state<Record<string, string>>({})
  const set = (key: 'name' | 'branch', value: string) =>
    (values.value = { ...values.value, [key]: value })
  return (
    <Stack as="form" gap="group">
      <Input
        label="Project name"
        value={values.value.name}
        error={errors.value.name ?? ''}
        onInput={(e) => set('name', e.currentTarget.value)}
      />
      <Input
        label="Production branch"
        value={values.value.branch}
        hint="Change a field and the bar rises."
        error={errors.value.branch ?? ''}
        onInput={(e) => set('branch', e.currentTarget.value)}
      />
      <SaveBar
        values={values}
        errors={errors}
        validate={(v) => (v.name.trim() ? {} : { name: 'A project needs a name.' })}
        onSave={() => wait(800)}
      />
      <Toaster />
    </Stack>
  )
}

export function DangerZoneProject() {
  const remove = state(false)
  const transfer = state(false)
  return (
    <SettingsWidth>
      <DangerZone
        id="danger-demo"
        description="These change who can reach storefront. One can't be undone."
      >
        <SettingRow title="Transfer project" description="Give storefront to another workspace.">
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            onClick={() => (transfer.value = true)}
          >
            Transfer
          </Button>
        </SettingRow>
        <SettingRow
          title="Delete project"
          description="Deletes storefront and its 412 deploys for good."
        >
          <Button emphasis="soft" tone="critical" size="sm" onClick={() => (remove.value = true)}>
            Delete project
          </Button>
        </SettingRow>
        <ConfirmDialog
          open={transfer}
          title="Transfer storefront?"
          description="You lose access until the new owner invites you."
          action="Transfer project"
          onConfirm={() => wait(600)}
        />
        <TypeToConfirm
          open={remove}
          title="Delete storefront?"
          description="This permanently deletes the project."
          confirmText="storefront"
          items={['412 deploys and their logs', 'Its environment variables']}
          action="Delete project"
          onConfirm={() => wait(800)}
        />
      </DangerZone>
    </SettingsWidth>
  )
}

export function ConfirmDialogPause() {
  const open = state(false)
  const paused = state(false)
  const confirm = async () => {
    await wait(700)
    paused.value = !paused.value
  }
  return (
    <>
      <Stack gap="related" align="center">
        <Text subtle>checkout is {paused.value ? 'paused' : 'live'}.</Text>
        <Button emphasis="outline" tone="neutral" onClick={() => (open.value = true)}>
          {paused.value ? 'Resume deploys' : 'Pause deploys'}
        </Button>
      </Stack>
      <ConfirmDialog
        open={open}
        title={paused.value ? 'Resume deploys?' : 'Pause deploys?'}
        description="This applies to everyone on checkout."
        action={paused.value ? 'Resume' : 'Pause deploys'}
        onConfirm={confirm}
      />
    </>
  )
}

export function ConfirmDialogRevoke() {
  const open = state(false)
  return (
    <>
      <Button emphasis="soft" tone="critical" onClick={() => (open.value = true)}>
        Remove 2 members
      </Button>
      <ConfirmDialog
        open={open}
        tone="critical"
        title="Remove 2 members?"
        description="Priya and Tomás lose access right away."
        action="Remove 2 members"
        onConfirm={() => wait(600)}
      />
    </>
  )
}

export function TypeToConfirmDelete() {
  const open = state(false)
  const gone = state(false)
  return (
    <>
      {gone.value ? (
        <Button emphasis="ghost" tone="neutral" onClick={() => (gone.value = false)}>
          reports deleted. Put it back
        </Button>
      ) : (
        <Button tone="critical" onClick={() => (open.value = true)}>
          Delete reports
        </Button>
      )}
      <TypeToConfirm
        open={open}
        title="Delete reports?"
        description="This can't be undone."
        confirmText="reports"
        items={['41 deploys and their logs', '3 scheduled jobs']}
        action="Delete project"
        onConfirm={async () => {
          await wait(700)
          gone.value = true
        }}
      />
    </>
  )
}

// -- members --

export function MembersTableTeam() {
  const people = state<readonly Member[]>(TEAM_MEMBERS)
  const invites = state<readonly Invite[]>(TEAM_INVITES)
  return (
    <>
      <MembersTable
        members={people}
        invites={invites}
        me="mara"
        roles={TEAM_ROLES}
        seats={12}
        onRoleChange={(m, role) =>
          (people.value = people.value.map((x) => (x.id === m.id ? { ...x, role } : x)))
        }
        onRemove={(gone) => {
          people.value = people.value.filter((x) => !gone.includes(x))
        }}
        onRestore={(back) => (people.value = [...people.value, ...back])}
        onInvite={(emails, role) => {
          invites.value = [
            ...invites.value,
            ...emails.map((email) => ({ id: email, email, role, sent: 'Just now' })),
          ]
        }}
        onRevoke={(invite) => (invites.value = invites.value.filter((x) => x !== invite))}
      />
      <Toaster />
    </>
  )
}

const FIRST_FOUR = TEAM_MEMBERS.slice(0, 4)

export const MembersTableTile = () => (
  <Stack gap="related" style="inline-size:300px">
    <SeatsMeter used={10} total={12} />
    {FIRST_FOUR.map((m) => (
      <Row key={m.id} justify="between">
        <Text>{m.name}</Text>
        <Badge>{m.role}</Badge>
      </Row>
    ))}
  </Stack>
)

export const SeatsMeterLevels = () => (
  <Stack gap="group">
    <SeatsMeter used={4} total={12} />
    <SeatsMeter used={10} total={12} />
    <SeatsMeter used={12} total={12} />
  </Stack>
)

export function SeatsMeterInvite() {
  const used = state(10)
  return (
    <Stack gap="related">
      <SeatsMeter used={used.value} total={12} />
      <Row justify="between">
        <Text subtle>Pending invites use a seat.</Text>
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          aria-disabled={used.value >= 12 ? 'true' : undefined}
          onClick={() => {
            if (used.value < 12) used.value++
          }}
        >
          Add a seat
        </Button>
      </Row>
    </Stack>
  )
}

/** The hub's card: short permissions across three roles, so the grid fits a card whole. */
const TILE_PERMISSIONS: Permission[] = [
  { id: 'deploy', label: 'Deploy', roles: ['owner', 'admin', 'member'] },
  { id: 'billing', label: 'Billing', roles: ['owner'] },
]
export const RolesMatrixTile = () => (
  <RolesMatrix roles={TEAM_ROLES.slice(0, 3)} permissions={TILE_PERMISSIONS} />
)
export const RolesMatrixReadOnly = () => (
  <RolesMatrix roles={TEAM_ROLES} permissions={TEAM_PERMISSIONS} />
)

export function RolesMatrixEdit() {
  const rows = state<Permission[]>(TEAM_PERMISSIONS)
  const flip = (p: Permission, role: string, on: boolean) => {
    rows.value = rows.value.map((x) =>
      x.id === p.id
        ? { ...x, roles: on ? [...x.roles, role] : x.roles.filter((r) => r !== role) }
        : x,
    )
  }
  return <RolesMatrix roles={TEAM_ROLES} permissions={rows.value} onToggle={flip} />
}

export function InviteDialogTeam() {
  const open = state(false)
  const sent = state<string[]>([])
  return (
    <>
      <Stack gap="related" align="center">
        <Button icon="plus" onClick={() => (open.value = true)}>
          Invite people
        </Button>
        <Text subtle>
          {sent.value.length ? `Invited ${sent.value.join(', ')}` : '3 seats left on Team.'}
        </Text>
      </Stack>
      <InviteDialog
        open={open}
        roles={INVITE_ROLES}
        defaultRole="member"
        seatsLeft={3}
        onSend={async (emails) => {
          await wait(600)
          sent.value = emails
        }}
      />
      <Toaster />
    </>
  )
}

export function TagsInputEmails() {
  const emails = state(['dara@weft.dev', 'kai@weft'])
  return (
    <TagsInput
      label="Email addresses"
      hint="Press Enter or comma after each one."
      value={emails}
      valid={(tag) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag)}
      error={
        emails.value.some((e) => !e.includes('.')) ? 'kai@weft is not a full address.' : undefined
      }
    />
  )
}

export function TagsInputLabels() {
  const labels = state(['production', 'eu-west'])
  return (
    <Stack gap="related">
      <TagsInput label="Project labels" value={labels} />
      <Text subtle>{labels.value.length} labels on storefront.</Text>
    </Stack>
  )
}

// -- keys --

export function ApiKeysTest() {
  const keys = state<readonly ApiKey[]>(API_KEYS)
  const create = async (draft: { name: string; scopes: string[] }) => {
    await wait(600)
    keys.value = [
      {
        id: draft.name,
        name: draft.name,
        prefix: 'tsl_test_77aa',
        scopes: draft.scopes,
        created: 'Today',
      },
      ...keys.value,
    ]
    return 'tsl_test_77aa_sample_not_a_real_key'
  }
  return (
    <>
      <ApiKeys
        keys={keys}
        now={NOW}
        onCreate={create}
        onRevoke={(key) => {
          keys.value = keys.value.filter((k) => k !== key)
        }}
      />
      <Toaster />
    </>
  )
}

const THREE_KEYS = API_KEYS.slice(0, 3)

export const ApiKeysTile = () => (
  <Stack gap="related" style="inline-size:300px">
    {THREE_KEYS.map((k) => (
      <Row key={k.id} justify="between">
        <Text>{k.name}</Text>
        <Badge>{k.scopes[0]}</Badge>
      </Row>
    ))}
  </Stack>
)

// -- billing --

export function PlanPickerTeam() {
  const current = state('team')
  const change = async (plan: { id: string }) => {
    await wait(700)
    current.value = plan.id
  }
  return (
    <>
      <PlanPicker
        plans={PLANS}
        current={current.value}
        seats={8}
        daysLeft={9}
        losses={(plan) =>
          plan.id === 'hobby' ? ['Preview environments', '7 of your 10 seats'] : []
        }
        onChange={change}
      />
      <Toaster />
    </>
  )
}

const TWO_PLANS = PLANS.slice(0, 2)

export const PlanPickerTile = () => (
  <Row gap="related">
    {TWO_PLANS.map((plan) => (
      <Card key={plan.id} title={plan.name}>
        <Text subtle>${plan.price} per seat</Text>
      </Card>
    ))}
  </Row>
)

export const UsageMeterLevels = () => (
  <Stack gap="group">
    <UsageMeter
      label="Build minutes"
      value={1240}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
    />
    <UsageMeter
      label="Build minutes"
      value={2610}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      note="You're close to this month's limit."
    />
    <UsageMeter
      label="Build minutes"
      value={3000}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      note="Builds queue until the 1st."
    />
    <UsageMeter
      label="Build minutes"
      value={3420}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      overage="+ $12.40 overage"
    />
  </Stack>
)

const gigabytes = (n: number) => `${n} GB`

export const UsageMetersThisMonth = () => (
  <UsageMeters>
    <UsageMeter
      label="Build minutes"
      value={1240}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
    />
    <UsageMeter
      label="Bandwidth"
      value={412}
      limit={500}
      format={gigabytes}
      note="Slows down past the limit, never stops."
    />
    <UsageMeter label="Seats" value={8} limit={10} />
    <UsageMeter
      label="Log storage"
      value={11.2}
      limit={10}
      format={gigabytes}
      overage="+ $12.40 overage"
    />
  </UsageMeters>
)

export const InvoicesHistory = () => <Invoices invoices={BILLS} onExport={() => {}} />

export function InvoicesFailed() {
  const fixed = state(false)
  return (
    <Invoices
      invoices={fixed.value ? BILLS : OVERDUE_BILLS}
      onUpdatePayment={() => (fixed.value = true)}
    />
  )
}

export function PaymentMethodsSaved() {
  const cards = state<readonly PaymentMethod[]>(CARDS)
  return (
    <>
      <PaymentMethods
        methods={cards}
        onDefault={(card) =>
          (cards.value = cards.value.map((c) => ({ ...c, default: c.id === card.id })))
        }
        onRemove={(card) => (cards.value = cards.value.filter((c) => c !== card))}
        onRestore={(card) => (cards.value = [...cards.value, card])}
      />
      <Toaster />
    </>
  )
}

const providerFields = (el: HTMLElement) => {
  const fields = el.ownerDocument.createElement('p')
  fields.textContent = 'Your payment provider mounts its fields here.'
  el.append(fields)
  return { destroy: () => fields.remove() }
}

export const PayFrameTestMode = () => (
  <PayFrame title="Card fields from your payment provider" testMode ready mount={providerFields} />
)

export const PayFrameLoading = () => <PayFrame title="Card fields from your payment provider" />

// -- audit and integrations --

export const AuditLogWorkspace = () => (
  <AuditLog
    events={AUDIT}
    now={NOW}
    categories={AUDIT_CATEGORIES}
    live="live"
    onExport={() => Promise.resolve({ retryAfter: 20 })}
  />
)

const LATEST_EVENTS = AUDIT.slice(0, 3)

export const AuditLogTile = () => (
  <Stack gap="related" style="inline-size:320px">
    {LATEST_EVENTS.map((e) => (
      <Text key={e.id}>
        {e.actor} {e.verb} {e.target}
      </Text>
    ))}
  </Stack>
)

export function IntegrationsGridWorkspace() {
  const items = state<readonly Integration[]>(INTEGRATIONS)
  const mark = (id: string, next: Partial<Integration>) =>
    (items.value = items.value.map((i) => (i.id === id ? { ...i, ...next } : i)))
  const connect = async (item: Integration) => {
    mark(item.id, { state: 'pending' })
    await wait(1200)
    mark(item.id, { state: 'connected', detail: 'weft-dev', failure: undefined })
  }
  return (
    <>
      <IntegrationsGrid
        items={items}
        onConnect={(item) => void connect(item)}
        onDisconnect={(item) => mark(item.id, { state: 'off' })}
        onRestore={(item) => mark(item.id, { state: 'connected' })}
        settings={(item) => <Input label="Channel or team" defaultValue={item.detail} />}
      />
      <Toaster />
    </>
  )
}

export function WebhooksEndpoints() {
  const hooks = state<readonly Webhook[]>(WEBHOOKS)
  const add = async (url: string, events: string[]) => {
    await wait(500)
    hooks.value = [...hooks.value, { id: url, url, events, healthy: true }]
    return 'whsec_sample_not_a_real_secret'
  }
  const test = async () => {
    await wait(400)
    return { status: 200, ms: 82 }
  }
  return (
    <>
      <Webhooks hooks={hooks} events={WEBHOOK_EVENTS} onAdd={add} onTest={test} />
      <Toaster />
    </>
  )
}

export function CsvImportTeam() {
  const run = async (_: Record<string, string>[], progress: (percent: number) => void) => {
    for (const percent of [20, 45, 70, 100]) {
      await wait(350)
      progress(percent)
    }
  }
  return <CsvImport targets={IMPORT_TARGETS} sample={IMPORT_SAMPLE} onImport={run} />
}

// -- shop --

export function CartButtonCount() {
  const count = state(3)
  return (
    <>
      <CartButton count={count.value} onClick={() => (count.value = 0)} />
      <Button emphasis="outline" tone="neutral" size="sm" onClick={() => count.value++}>
        Add a hoodie
      </Button>
    </>
  )
}

export function CartDrawerShop() {
  const cart = state(SHOP_CART)
  const open = state(false)
  const placed = state(false)
  return (
    <>
      <Stack gap="related" align="center">
        <CartButton
          count={cart.value.reduce((n, line) => n + line.quantity, 0)}
          onClick={() => (open.value = true)}
        />
        <Text subtle>{placed.value ? 'On to checkout.' : 'Open the cart, change a quantity.'}</Text>
      </Stack>
      <CartDrawer open={open} cart={cart} onCheckout={() => (placed.value = true)} />
      <Toaster />
    </>
  )
}

export function LineItemCart() {
  const cart = state(SHOP_CART)
  return (
    <Card>
      <Stack gap="related">
        {cart.value.map((line) => (
          <LineItem key={line.id} line={line} cart={cart} />
        ))}
        {cart.value.length === 0 && <Text subtle>Your cart is empty.</Text>}
      </Stack>
      <Toaster />
    </Card>
  )
}

const PAYMENT_FRAME = () => (
  <PayFrame title="Card fields from your payment provider" testMode ready mount={providerFields} />
)

export function CheckoutShop() {
  const cart = state(SHOP_CART)
  const place = async (): Promise<PlaceOrderResult> => {
    await wait(900)
    return { order: { id: 'T-2041', stage: 'placed' } }
  }
  return (
    <>
      <Checkout
        cart={cart}
        shipping={SHOP_SHIPPING}
        countries={['US', 'GB', 'DE']}
        taxRate={0.08}
        coupon={(code) => (code === 'WEFT10' ? { code, percentOff: 10 } : undefined)}
        payment={<PAYMENT_FRAME />}
        onPlaceOrder={place}
        onContinueShopping={() => (cart.value = SHOP_CART)}
      />
      <Toaster />
    </>
  )
}

export const CheckoutTile = () => <OrderTracker stage="packed" />

export const OrderConfirmationPlaced = () => (
  <OrderConfirmation
    orderId="T-2041"
    email={PEOPLE[0]!.email}
    stage="packed"
    note="Standard delivery, arrives Thu 6 Nov."
    onTrack={() => {}}
    onContinue={() => {}}
  />
)

const STAGES: { value: OrderStage; label: string }[] = [
  { value: 'placed', label: 'Placed' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
]

export function OrderTrackerStages() {
  const stage = state<OrderStage>('shipped')
  return (
    <Stack gap="group">
      <OrderTracker stage={stage.value} />
      <Segmented
        label="Stage"
        size="sm"
        value={stage.value}
        options={STAGES}
        onChange={(v) => (stage.value = v)}
      />
    </Stack>
  )
}
