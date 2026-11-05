import type { ModelOption } from '@weft-js/warp'

export const MODELS: ModelOption[] = [
  {
    id: 'deep',
    name: 'weft Deep',
    short: 'Deep',
    provider: 'Hosted',
    description: 'Long investigations',
    capabilities: ['tools', 'logs'],
    context: '200k',
    cost: '$$$',
  },
  {
    id: 'swift',
    name: 'weft Swift',
    short: 'Swift',
    provider: 'Hosted',
    description: 'Fast, good at config',
    capabilities: ['tools'],
    context: '200k',
    cost: '$$',
  },
  {
    id: 'local',
    name: 'On-prem small',
    short: 'Small',
    provider: 'Your cluster',
    description: 'Stays on your network',
    context: '32k',
    cost: '$',
  },
]
