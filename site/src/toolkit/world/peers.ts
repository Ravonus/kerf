import type { Peer } from '@kerf-js/veneer'
import { PEOPLE } from './people'

export const PEERS: Peer[] = PEOPLE.map((p, i) => ({
  id: p.id,
  name: p.name,
  color: i + 1,
}))

export const [
  MARA,
  JUN,
  PRIYA,
  TOMAS,
  LENA,
  NOOR,
  SAM,
  INES,
] = PEERS as [
  Peer,
  Peer,
  Peer,
  Peer,
  Peer,
  Peer,
  Peer,
  Peer,
]
