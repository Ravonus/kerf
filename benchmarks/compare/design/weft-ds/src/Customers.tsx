import { state, derived } from '@weft-js/core'
import { Badge, Button, Heading, Modal, Search, Stack, Table, Text } from '@weft-js/warp'

type Status = 'Active' | 'Trial' | 'Past due'
type Customer = { id: number; name: string; email: string; plan: string; status: Status }

const seed: Customer[] = [
  ['Maya Okafor', 'maya@brightloom.co', 'Team', 'Active'],
  ['Liam Chen', 'liam@harborlabs.io', 'Starter', 'Trial'],
  ['Sofia Alvarez', 'sofia@tidepool.app', 'Enterprise', 'Active'],
  ['Noah Becker', 'noah@fernwood.de', 'Team', 'Past due'],
  ['Priya Raman', 'priya@lumenworks.in', 'Team', 'Active'],
  ['Ethan Brooks', 'ethan@copperline.com', 'Starter', 'Active'],
  ['Hana Sato', 'hana@kitebox.jp', 'Enterprise', 'Active'],
  ['Omar Haddad', 'omar@sandstone.ae', 'Starter', 'Past due'],
  ['Grace Murphy', 'grace@oakandpine.ie', 'Team', 'Trial'],
  ['Lucas Silva', 'lucas@vertice.br', 'Team', 'Active'],
  ['Chloe Dubois', 'chloe@atelier9.fr', 'Starter', 'Trial'],
  ['Jonas Berg', 'jonas@nordlys.se', 'Enterprise', 'Past due'],
].map(([name, email, plan, status], i) => ({ id: i + 1, name, email, plan, status }) as Customer)

const tones = { Active: 'positive', Trial: 'info', 'Past due': 'critical' } as const

export function Customers() {
  const rows = state<Customer[]>(seed)
  const query = state('')
  const pending = state<Customer | null>(null)
  const confirming = state(false)

  const shown = derived(() =>
    rows.value.filter((c) => c.name.toLowerCase().includes(query.value.trim().toLowerCase())),
  )

  const ask = (c: Customer) => {
    pending.value = c
    confirming.value = true
  }
  const remove = () => {
    const gone = pending.value
    if (gone) rows.value = rows.value.filter((c) => c.id !== gone.id)
    confirming.value = false
  }

  return (
    <Stack gap="group">
      <Stack gap="related">
        <Heading level={1} role="title">
          Customers
        </Heading>
        <Text subtle>Everyone on a Northwind plan, and where their account stands.</Text>
      </Stack>
      <Search
        label="Search"
        value={query.value}
        onInput={(e: any) => (query.value = e.currentTarget.value)}
      />
      {shown.value.length > 0 ? (
        <Table
          caption="Customers"
          captionHidden
          picker={false}
          rows={shown}
          columns={[
            { id: 'name', header: 'Name', rowHeader: true },
            { id: 'email', header: 'Email', priority: 2 },
            { id: 'plan', header: 'Plan' },
            {
              id: 'status',
              header: 'Status',
              cell: (c: Customer) => (
                <Badge tone={tones[c.status]} dot>
                  {c.status}
                </Badge>
              ),
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (c: Customer) => (
                <Button
                  emphasis="ghost"
                  tone="critical"
                  size="sm"
                  onClick={() => ask(c)}
                >{`Delete ${c.name}`}</Button>
              ),
            },
          ]}
        />
      ) : (
        <Text role="heading" subtle>
          No customers found
        </Text>
      )}
      <Modal
        open={confirming}
        alert
        tone="critical"
        title="Delete customer?"
        description={`${pending.value?.name ?? 'This customer'} will be removed from Northwind. This can't be undone.`}
        footer={
          <>
            <Button
              emphasis="ghost"
              tone="neutral"
              autofocus
              onClick={() => (confirming.value = false)}
            >
              Keep
            </Button>
            <Button tone="critical" onClick={remove}>
              Delete
            </Button>
          </>
        }
      >
        <Text subtle>Their invoices stay in your records.</Text>
      </Modal>
    </Stack>
  )
}
