// The site's expression (../expression): vivid unless the reader chose another stop. kerf.config.ts's head paints the
// root from it (and the saved stop) before the first frame, and every dial on the page renders it on the server, so the
// server's markup is what a fresh visitor sees.
import { EXPRESSION } from '../expression'
export { EXPRESSION }
type Stop = 'quiet' | 'balanced' | 'vivid'
/** The stop the page is painted at: the root's, which the head wrote before paint; the default on the server. */
export const shownExpression = (): Stop =>
  ((typeof document !== 'undefined' && document.documentElement?.dataset?.expression) ||
    EXPRESSION) as Stop
