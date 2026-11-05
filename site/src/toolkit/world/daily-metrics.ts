import { wobble } from './latency'

export const LATENCY_DAYS = Array.from({ length: 30 }, (_, i) => {
  const open = 112 + Math.sin(i / 4) * 14 + i * 0.3,
    close = open + wobble(i + 40) * 12
  return {
    label: `Oct ${i + 1}`,
    open: Math.round(open),
    close: Math.round(close),
    high: Math.round(Math.max(open, close) + 3 + Math.abs(wobble(i)) * 9),
    low: Math.round(Math.min(open, close) - 3 - Math.abs(wobble(i + 9)) * 7),
  }
})

export const SEATS_BRIDGE = [
  { name: 'Q3', value: 820, total: true },
  { name: 'New teams', value: 210 },
  { name: 'Expansion', value: 96 },
  { name: 'Contraction', value: -38 },
  { name: 'Churn', value: -74 },
  { name: 'Q4', value: 1014, total: true },
]

export const SIGNUPS_DAILY = Array.from({ length: 120 }, (_, i) => ({
  day: `Day ${i + 1}`,
  signups: Math.round(118 + Math.sin(i / 9) * 26 + i * 0.5 + wobble(i) * 12),
}))

export const TEAMS_BY_STATE =
  'AK,ME,VT,NH,WA,ID,MT,ND,MN,IL,WI,MI,NY,RI,MA,OR,NV,WY,SD,IA,IN,OH,PA,NJ,CT,CA,UT,CO,NE,MO,KY,WV,VA,MD,DE,AZ,NM,KS,AR,TN,NC,SC,DC,OK,LA,MS,AL,GA,HI,TX,FL'
    .split(',')
    .map((id, i) => ({
      id,
      value:
        (
          { CA: 188, NY: 142, TX: 121, WA: 96, MA: 74, IL: 68, CO: 57, GA: 44, FL: 52 } as Record<
            string,
            number
          >
        )[id] ?? 4 + ((i * 37) % 31),
    }))
