import type { ApiKey } from '@weft-js/warp'

export const API_KEYS: ApiKey[] = [
  {
    id: 'k1',
    name: 'CI deploys',
    prefix: 'tsl_test_8c2f',
    scopes: ['deploy'],
    created: 'Sep 30',
    lastUsed: '2026-10-31T16:42:00Z',
  },
  {
    id: 'k2',
    name: 'Metrics export',
    prefix: 'tsl_test_41ab',
    scopes: ['read'],
    created: 'Aug 2',
    lastUsed: '2026-10-12T10:00:00Z',
  },
  {
    id: 'k3',
    name: 'Staging smoke tests',
    prefix: 'tsl_test_e07d',
    scopes: ['read', 'deploy'],
    created: 'Jul 19',
    lastUsed: '2026-10-30T04:10:00Z',
  },
  {
    id: 'k4',
    name: 'Old Jenkins box',
    prefix: 'tsl_test_19c4',
    scopes: ['deploy'],
    created: 'Mar 3',
  },
]
