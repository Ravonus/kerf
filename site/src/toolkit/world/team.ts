import type { Role, Member, Invite } from '@weft-js/warp'
import { PEOPLE } from './people'

export const NOW = '2026-10-31T17:00:00Z'

export const TEAM_ROLES: Role[] = [
  { value: 'owner', label: 'Owner', manages: true },
  { value: 'admin', label: 'Admin', manages: true },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]

export const INVITE_ROLES = TEAM_ROLES.slice(1)

export const LAST_SEEN = [
  'Active now',
  '12 min ago',
  '1 h ago',
  'Today',
  'Yesterday',
  'Oct 28',
  'Oct 24',
  'Oct 12',
]

export const TEAM_MEMBERS: Member[] = PEOPLE.map(
  (p, i) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role.toLowerCase(),
    lastActive: LAST_SEEN[i],
  }),
)

export const TEAM_INVITES: Invite[] = [
  {
    id: 'dara',
    email: 'dara@weft.dev',
    role: 'member',
    sent: '2 days ago',
  },
  {
    id: 'kai',
    email: 'kai@contract.dev',
    role: 'viewer',
    sent: 'Oct 27',
  },
]

export const TEAM_PERMISSIONS = [
  {
    id: 'view',
    label: 'See projects and deploys',
    roles: ['owner', 'admin', 'member', 'viewer'],
  },
  {
    id: 'deploy',
    label: 'Deploy to production',
    roles: ['owner', 'admin', 'member'],
  },
  {
    id: 'env',
    label: 'Change environment variables',
    roles: ['owner', 'admin', 'member'],
  },
  {
    id: 'invite',
    label: 'Invite and remove members',
    roles: ['owner', 'admin'],
  },
  {
    id: 'keys',
    label: 'Create API keys',
    roles: ['owner', 'admin'],
  },
  {
    id: 'billing',
    label: 'Change billing and plan',
    roles: ['owner'],
  },
]
