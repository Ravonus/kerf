import { TRAFFIC } from './traffic'

export const REQUESTS_BY_REGION = TRAFFIC.map((t, i) => ({
  month: t.month,
  euWest: Math.round(t.requests * (0.42 - i * 0.003) * 10) / 10,
  usEast: Math.round(t.requests * (0.3 + (i % 3) * 0.006) * 10) / 10,
  apSouth: Math.round(t.requests * (0.1 + i * 0.006) * 10) / 10,
}))

export const COST_BY_SERVICE = TRAFFIC.map((t) => {
  const compute = Math.round(t.cost * 0.56),
    storage = Math.round(t.cost * 0.17),
    database = Math.round(t.cost * 0.15)
  return {
    month: t.month,
    compute,
    storage,
    database,
    network: t.cost - compute - storage - database,
  }
})
