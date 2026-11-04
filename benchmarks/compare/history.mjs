// Measurement and chart generation share the maintained history file after the layout move.
import { fileURLToPath } from 'node:url'

/** The history stays beside the retained evaluation summary. */
export const historyFile = fileURLToPath(
  new URL('../../evals/results/compare-history.jsonl', import.meta.url),
)
