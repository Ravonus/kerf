import { state } from '@kerf/core'
import { UserMessage } from '@kerf/veneer'

export function UserMessageEditable() {
  const text = state(
    'Roll back mobile-bff in every region',
  )
  return (
    <UserMessage
      text={text.value}
      onEdit={(next) => (text.value = next)}
    />
  )
}
