import {
  Assistant,
  Stack,
  UserMessage,
} from '@kerf-js/veneer'
import { QUESTION, SHORT } from './shared'

/** The hub's card: one exchange, without the frame's
 * title, which is sized for a whole pane. */
export const ConversationTile = () => (
  <Stack gap="related">
    <UserMessage text={QUESTION} />
    <Assistant
      answer={SHORT}
      quiet
    />
  </Stack>
)
