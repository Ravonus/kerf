import type { Webhook } from '@kerf-js/veneer'

export const WEBHOOKS: Webhook[] = [
  {
    id: 'h1',
    url: 'https://hooks.kerf.dev/deploys',
    events: ['deploy.succeeded', 'deploy.failed'],
    lastDelivery: '200 · 18 min ago',
    healthy: true,
  },
  {
    id: 'h2',
    url: 'https://ops.kerf.dev/alerts',
    events: ['deploy.failed'],
    lastDelivery: '503 · 1 h ago',
    healthy: false,
  },
]

export const WEBHOOK_EVENTS = [
  'deploy.succeeded',
  'deploy.failed',
  'deploy.rolled_back',
  'member.added',
]
