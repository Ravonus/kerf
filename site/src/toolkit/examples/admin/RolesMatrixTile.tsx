import { RolesMatrix } from '@weft-js/warp'
import { TEAM_ROLES } from '../../world'
import { TILE_PERMISSIONS } from './shared'

export const RolesMatrixTile = () => (
  <RolesMatrix roles={TEAM_ROLES.slice(0, 3)} permissions={TILE_PERMISSIONS} />
)
