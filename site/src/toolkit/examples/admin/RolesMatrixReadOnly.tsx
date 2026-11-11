import { RolesMatrix } from '@kerf/veneer'
import { TEAM_PERMISSIONS, TEAM_ROLES } from '../../world'

export const RolesMatrixReadOnly = () => (
  <RolesMatrix
    roles={TEAM_ROLES}
    permissions={TEAM_PERMISSIONS}
  />
)
