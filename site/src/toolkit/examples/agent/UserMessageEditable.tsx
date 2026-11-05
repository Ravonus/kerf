import { state } from '@weft-js/core'
import { UserMessage } from '@weft-js/warp'

export function UserMessageEditable() {
  const text = state('Roll back mobile-bff in every region')
  return <UserMessage text={text.value} onEdit={(next) => (text.value = next)} />
}
