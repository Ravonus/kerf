import { UserMessage } from '@weft-js/warp'

export const UserMessageLong = () => (
  <UserMessage
    text={
      'Compare d-4819 with the last good ' +
      'deploy of mobile-bff. Tell me what' +
      ' changed, whether the change ' +
      'explains the failed check, and ' +
      'what you would do next.'
    }
  />
)
