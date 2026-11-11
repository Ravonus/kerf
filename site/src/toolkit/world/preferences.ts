import type { PrefGroup } from '@kerf-js/veneer-core'

export const CHANNELS = [
  { id: 'inapp', label: 'In-app' },
  { id: 'email', label: 'Email' },
  { id: 'push', label: 'Push' },
  { id: 'sms', label: 'SMS' },
]

export const PREF_GROUPS: PrefGroup[] = [
  {
    id: 'deploys',
    label: 'Deploys',
    events: [
      {
        id: 'failed',
        label: 'Failed deploys',
        hint: 'A deploy you own fails a check',
      },
      {
        id: 'live',
        label: 'Deploys gone live',
        hint: 'On projects you watch',
      },
      {
        id: 'approve',
        label: 'Approvals',
        hint: 'A release needs your yes',
      },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    events: [
      {
        id: 'mention',
        label: 'Mentions',
        hint: 'Someone @-mentions you',
      },
      {
        id: 'invite',
        label: 'Invitations',
        hint: 'New events and changes',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    events: [
      {
        id: 'security',
        label: 'Security alerts',
        hint: 'New sign-in or API key',
        instant: true,
      },
      {
        id: 'billing',
        label: 'Billing',
        hint: 'Invoices and failed payments',
      },
    ],
  },
]

export const PREFS = {
  failed: {
    inapp: true,
    email: true,
    push: true,
    sms: true,
  },
  live: { inapp: true, email: false, push: false },
  approve: { inapp: true, email: true, push: true },
  mention: {
    inapp: true,
    email: true,
    push: true,
    sms: false,
  },
  invite: { inapp: true, email: true },
  security: {
    inapp: true,
    email: true,
    push: true,
    sms: true,
  },
  billing: { inapp: false, email: true },
}

export const PREF_OFFERED = {
  live: ['inapp', 'email', 'push'],
  approve: ['inapp', 'email', 'push'],
  invite: ['inapp', 'email'],
  billing: ['inapp', 'email'],
}

export const PREF_LOCKED = { security: ['email'] }
