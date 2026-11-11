import { TileMap } from '@kerf-js/veneer'

import { TEAMS_BY_STATE } from '../../world'

import { dollars as _Shared0 } from './shared-dollars'

export const TileMapTeams = () => (
  <TileMap
    title="Teams by state"
    description={
      'Every state the same size, so ' +
      'small ones still read'
    }
    data={TEAMS_BY_STATE}
    unit="teams"
  />
)
