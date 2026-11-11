import { state } from '@kerf/core'
import { RolesMatrix } from '@kerf/veneer'
import type { Permission } from '@kerf/veneer'
import { TEAM_PERMISSIONS, TEAM_ROLES } from '../../world'

export function RolesMatrixEdit() {
  const rows = state<Permission[]>(TEAM_PERMISSIONS)
  const flip = (
    p: Permission,
    role: string,
    on: boolean,
  ) => {
    rows.value = rows.value.map((x) =>
      x.id === p.id
        ? {
            ...x,
            roles: on
              ? [...x.roles, role]
              : x.roles.filter((r) => r !== role),
          }
        : x,
    )
  }
  return (
    <RolesMatrix
      roles={TEAM_ROLES}
      permissions={rows.value}
      onToggle={flip}
    />
  )
}
