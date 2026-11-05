export const CAL_TODAY = '2026-11-02'

export const CAL_NOW = '2026-11-02T10:40'

export const BUSY_TODAY = '2026-11-04'

export const BUSY_NOW = '2026-11-04T11:40'

export const CALENDARS = ['Releases', 'On-call', 'Team', 'Customers'].map((name, i) => ({
  id: i + 1,
  name,
}))

export const ROOMS = [
  { id: 'atlas', name: 'Atlas', meta: '8 seats' },
  { id: 'birch', name: 'Birch', meta: '6 seats' },
  { id: 'cedar', name: 'Cedar', meta: '12 seats' },
]
