import { tries as describe } from './try-describe'
import { tries as escape } from './try-escape'
import { tries as interact } from './try-interact'
import { tries as manage } from './try-manage'
import { tries as server } from './try-server'
import { tries as setup } from './try-setup'
import { tries as stack } from './try-stack'
import { tries as start } from './try-start'
import { tries as style } from './try-style'
import { tries as tool } from './try-tool'

/** The "Try this" line under each Learn demo, by demo
 * id. Each chapter keeps its own file, so writers
 * don't collide.
 */
export const tries: Record<string, string> = {
  ...start,
  ...setup,
  ...describe,
  ...interact,
  ...manage,
  ...escape,
  ...stack,
  ...server,
  ...style,
  ...tool,
}
