import { state } from '@kerf/core'

import {
  Button,
  ConflictAlert,
  Stack,
  Text,
} from '@kerf/veneer'

import { JUN } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function ConflictAlertReviewDate() {
  const picked = state<string | null>(null)
  return (
    <>
      {picked.value ? (
        <Stack
          gap="related"
          align="center"
        >
          <Text>Review date: {picked.value}</Text>
          <Button
            size="sm"
            emphasis="ghost"
            tone="neutral"
            onClick={() => (picked.value = null)}
          >
            Show the conflict again
          </Button>
        </Stack>
      ) : (
        <ConflictAlert
          field="Review date"
          peer={JUN}
          time="10:31"
          theirs="Nov 21"
          yours="Nov 14"
          onUseTheirs={() => (picked.value = 'Nov 21')}
          onKeepMine={() => (picked.value = 'Nov 14')}
        />
      )}
    </>
  )
}
