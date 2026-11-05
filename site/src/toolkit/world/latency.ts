export const wobble = (i: number) =>
  (Math.sin(i * 12.9898) * 43758.5453) % 1

export const LATENCIES = Array.from(
  { length: 240 },
  (_, i) =>
    Math.round(
      62 +
        Math.abs(wobble(i)) * 70 +
        Math.abs(wobble(i + 300)) * 50 +
        (i % 37 === 0 ? 160 : 0),
    ),
)

export const LATENCY_BY_REGION = [
  'eu-west',
  'us-east',
  'ap-south',
  'us-west',
  'eu-north',
].map((name, r) => ({
  name,
  values: Array.from({ length: 60 }, (_, i) =>
    Math.round(
      58 +
        r * 21 +
        Math.abs(wobble(i + r * 80)) * (40 + r * 14) +
        (i === 7 + r ? 140 : 0),
    ),
  ),
}))
