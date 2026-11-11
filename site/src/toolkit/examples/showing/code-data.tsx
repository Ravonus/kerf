import { DEPLOYS } from '../../world'

export const CONFIG =
  `import { defineProject } from 'kerf'` +
  `

export default defineProject({
  name: 'storefront',
  regions: ['eu-west', 'us-east'],
  build: 'npm run build',
})`

export const SAMPLE = JSON.stringify(DEPLOYS[0], null, 2)

export const STACKS = {
  ts:
    'const res = await kerf.deploy({ ' +
    "project: 'storefront' })" +
    '\nconsole.log(res.url)',
  sh: `kerf deploy --project storefront`,
  json: `{ "project": "storefront" }`,
}

export const WAYS = [
  { value: 'ts', label: 'SDK' },
  { value: 'sh', label: 'CLI' },
  { value: 'json', label: 'API' },
]
