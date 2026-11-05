import { RolesMatrix } from '@weft-js/warp'
import { TEAM_PERMISSIONS, TEAM_ROLES } from '../../world'

export const RolesMatrixReadOnly = () => (
  <RolesMatrix roles={TEAM_ROLES} permissions={TEAM_PERMISSIONS} />
)
