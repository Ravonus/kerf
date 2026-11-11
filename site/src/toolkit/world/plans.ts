import type { BillingPlan } from '@kerf-js/veneer'

export const PLANS: BillingPlan[] = [
  {
    id: 'hobby',
    name: 'Hobby',
    price: 0,
    description: 'For side projects.',
    features: [
      '3 seats',
      '100 deploys a month',
      '1 region',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: 24,
    description: 'For product teams.',
    features: [
      '10 seats',
      'Unlimited deploys',
      '5 regions',
      'Preview environments',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 64,
    description: 'For many teams.',
    features: [
      '50 seats',
      'Unlimited deploys',
      'Every region',
      'SSO and audit export',
    ],
  },
]
