import { PayFrame } from '@kerf-js/veneer'
import type {
  OrderStage,
  Permission,
} from '@kerf-js/veneer'
import {
  API_KEYS,
  AUDIT,
  PLANS,
  TEAM_MEMBERS,
} from '../../world'

export const wait = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms)
  })

// -- settings --

// A row lays out side by side inside a `settings`
// container, which SettingsLayout normally provides.
export const SettingsWidth = ({
  children,
}: {
  children: unknown
}) => (
  <div style="container: settings / inline-size">
    {children}
  </div>
)

export const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'deploys', label: 'Deploys' },
  { id: 'alerts', label: 'Notifications' },
  {
    id: 'project-danger',
    label: 'Danger zone',
    tone: 'critical' as const,
  },
]

export const REGIONS = [
  { value: 'eu-west', label: 'eu-west' },
  { value: 'us-east', label: 'us-east' },
  { value: 'ap-south', label: 'ap-south' },
]

export const NODE_VERSIONS = [
  { value: '26', label: 'Node 26' },
  { value: '24', label: 'Node 24' },
]

export const FIRST_FOUR = TEAM_MEMBERS.slice(0, 4)

/** Short permissions across three roles keep the hub's
 * grid inside a card.
 */
export const TILE_PERMISSIONS: Permission[] = [
  {
    id: 'deploy',
    label: 'Deploy',
    roles: ['owner', 'admin', 'member'],
  },
  { id: 'billing', label: 'Billing', roles: ['owner'] },
]

export const THREE_KEYS = API_KEYS.slice(0, 3)

export const TWO_PLANS = PLANS.slice(0, 2)

export const gigabytes = (n: number) => `${n} GB`

export const providerFields = (el: HTMLElement) => {
  const fields = el.ownerDocument.createElement('p')
  fields.textContent =
    'Your payment provider mounts its fields here.'
  el.append(fields)
  return { destroy: () => fields.remove() }
}

export const LATEST_EVENTS = AUDIT.slice(0, 3)

export const PAYMENT_FRAME = () => (
  <PayFrame
    title="Card fields from your payment provider"
    testMode
    ready
    mount={providerFields}
  />
)

export const STAGES: {
  value: OrderStage
  label: string
}[] = [
  { value: 'placed', label: 'Placed' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
]
