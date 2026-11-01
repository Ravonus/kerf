import started from './getting-started'
import rules from './rules'
import props from './props'
import lists from './lists'
import later from './async'

export const demos: Record<string, () => any> = { 'getting-started': started, rules, props, lists, async: later }
