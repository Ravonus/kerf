import { state } from '@kerf-js/core'
import {
  MessageActions,
  Prose,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { copyConfirm } from '@kerf-js/veneer-core'

export function MessageActionsFeedback() {
  const said = state('Nothing yet')
  const copy = (el: HTMLElement) => {
    void copyConfirm(el, 'Rollback finished.')
    said.value = 'Copied'
  }
  return (
    <Stack gap="related">
      <Prose
        text={
          'Rollback finished. `mobile-bff` is' +
          ' back on `d-4801`.'
        }
      />
      <MessageActions
        onCopy={copy}
        onFeedback={(value, reason) =>
          (said.value =
            reason ??
            (value ? `Rated ${value}` : 'Rating cleared'))
        }
        onRegenerate={() => (said.value = 'Regenerating')}
        onBranch={() => (said.value = 'New branch')}
      />
      <Text
        role="caption"
        subtle
      >
        Last action: {said.value}
      </Text>
    </Stack>
  )
}
