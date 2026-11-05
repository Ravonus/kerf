export const SPEND_TREE = [
  {
    name: 'Compute',
    children: [
      { name: 'Builds', value: 2120 },
      { name: 'Functions', value: 1840 },
      { name: 'Edge', value: 1040 },
    ],
  },
  {
    name: 'Storage',
    children: [
      { name: 'Artifacts', value: 980 },
      { name: 'Logs', value: 540 },
    ],
  },
  {
    name: 'Database',
    children: [
      { name: 'Primary', value: 860 },
      { name: 'Replicas', value: 480 },
    ],
  },
  {
    name: 'Network',
    children: [
      { name: 'CDN', value: 720 },
      { name: 'Egress', value: 350 },
    ],
  },
]
