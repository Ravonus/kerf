import type { Integration } from '@weft-js/warp'

export const INTEGRATIONS: Integration[] = [
  {
    id: 'github',
    name: 'GitHub',
    summary:
      'Deploy on push, status checks on pull requests.',
    state: 'connected',
    detail: 'weft-dev · 10 repositories',
    can: [
      'Read your repositories',
      'Post commit statuses',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    summary: 'Deploy and incident messages in a channel.',
    state: 'error',
    detail: 'Token expired Oct 26',
    failure: 'Messages to #deploys stopped on Oct 26.',
    can: ['Post to the channel you pick'],
  },
  {
    id: 'linear',
    name: 'Linear',
    summary: 'Link deploys to the issues they close.',
    state: 'off',
    can: ['Read your issues', 'Comment on issues'],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    summary: 'Mark deploys on your dashboards.',
    state: 'off',
    can: ['Send events to your account'],
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    summary:
      'Page the on-call person when a deploy fails.',
    state: 'off',
    can: ['Open incidents'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    summary:
      'Tie new errors to the deploy that caused them.',
    state: 'connected',
    detail: 'weft · 4 projects',
    can: ['Read releases'],
  },
]
