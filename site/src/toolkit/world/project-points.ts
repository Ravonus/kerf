import { PROJECTS } from './projects'

export const REGION_GROUP: Record<string, string> = {
  'eu-west': 'Europe',
  'eu-north': 'Europe',
  'us-east': 'Americas',
  'us-west': 'Americas',
}

export const pointsIn = (group: string) =>
  PROJECTS.filter(
    (p) =>
      (REGION_GROUP[p.region] ?? 'Elsewhere') === group,
  ).map((p) => ({
    name: p.name,
    x: p.deploys,
    y: p.latency,
    size: Math.round(p.cost / 100),
  }))

export const PROJECT_POINTS = [
  'Europe',
  'Americas',
  'Elsewhere',
].map((name) => ({
  name,
  points: pointsIn(name),
}))
