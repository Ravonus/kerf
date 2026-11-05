import { state } from '@weft-js/core'
import { RolesMatrix } from '@weft-js/warp'
import type { Permission } from '@weft-js/warp'
import { TEAM_PERMISSIONS, TEAM_ROLES } from '../../world'

export function RolesMatrixEdit() {
  const rows = state<Permission[]>(TEAM_PERMISSIONS)
  const flip = (p: Permission, role: string, on: boolean) => {
    rows.value = rows.value.map((x) =>
      x.id === p.id
        ? { ...x, roles: on ? [...x.roles, role] : x.roles.filter((r) => r !== role) }
        : x,
    )
  }
  return <RolesMatrix roles={TEAM_ROLES} permissions={rows.value} onToggle={flip} />
}
