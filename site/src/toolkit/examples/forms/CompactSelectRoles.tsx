import {
  CompactSelect,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { TEAM_ROLES, TEAM } from './shared'

export const CompactSelectRoles = () => (
  <Stack
    gap="related"
    divided
  >
    {TEAM.map((p) => (
      <Row
        key={p.id}
        justify="between"
        gap="group"
      >
        <Stack gap="hair">
          <Text>{p.name}</Text>
          <Text
            role="caption"
            subtle
          >
            {p.email}
          </Text>
        </Stack>
        <CompactSelect
          label={`Role for ${p.name}`}
          options={TEAM_ROLES}
          defaultValue={p.role}
        />
      </Row>
    ))}
  </Stack>
)
