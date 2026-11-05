import type { AgentSource } from '@weft-js/warp'

export const DEPLOY_SOURCES: AgentSource[] = [
  {
    title: 'd-4819 build log',
    path: 'mobile-bff · 15:27',
    snippet:
      'health check failed: upstream ' +
      'timed out after 3000 ms in ' +
      'ap-south',
  },
  {
    title: 'Health checks',
    path: 'weft docs · Deploys',
    snippet:
      'A deploy that fails three ' +
      'checks in a row is held back ' +
      'from traffic.',
  },
  {
    title: 'c44e190',
    path: 'mobile-bff · retry.ts · L18',
    snippet: 'const attempts = 5 // was 2',
  },
]
