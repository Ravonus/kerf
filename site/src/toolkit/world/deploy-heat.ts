import { wobble } from './latency'

export const WEEK_DAYS = [3, 5, 4, 6, 3, 0, 1]

export const DEPLOY_WEEKS = Array.from({ length: 26 }, (_, w) => `W${w + 19}`)

export const DEPLOY_HEAT = DEPLOY_WEEKS.map((_, w) =>
  WEEK_DAYS.map((d, i) =>
    d === 0 ? 0 : Math.max(0, Math.round(d * (0.7 + w * 0.04) + wobble(w * 7 + i) * 3)),
  ),
)
