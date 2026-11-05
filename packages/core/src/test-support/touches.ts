import { expect } from 'vitest'
import { stats } from '../index'
import { flush } from './flush'

/** What `toTouchAtMost` counts a write's cost by. */
export type Touches = {
  mutations: number
  /** Reactive computations re-run (derived values and bindings). */
  runs: number
  added: number
  removed: number
  text: number
  attributes: number
}

/** Count the DOM mutations and reactive re-runs one interaction causes, after everything has settled. */
export async function touches(interaction: () => unknown): Promise<Touches> {
  const records: MutationRecord[] = []
  const observer = new MutationObserver((r) => records.push(...r))
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  const runs = stats.runs
  await interaction()
  await flush()
  records.push(...observer.takeRecords())
  observer.disconnect()
  const t: Touches = {
    mutations: records.length,
    runs: stats.runs - runs,
    added: 0,
    removed: 0,
    text: 0,
    attributes: 0,
  }
  for (const r of records) {
    if (r.type === 'characterData') t.text++
    else if (r.type === 'attributes') t.attributes++
    else {
      t.added += r.addedNodes.length
      t.removed += r.removedNodes.length
    }
  }
  return t
}

export function installTouchMatcher() {
  expect.extend({
    async toTouchAtMost(
      interaction: () => unknown,
      mutations: number,
      budget: { runs?: number } = {},
    ) {
      const t = await touches(interaction)
      const pass = t.mutations <= mutations && (budget.runs === undefined || t.runs <= budget.runs)
      const limits = `≤ ${mutations} DOM mutations${budget.runs === undefined ? '' : ` and ≤ ${budget.runs} re-runs`}`
      const got = `${t.mutations} mutations (${t.added} added, ${t.removed} removed, ${t.text} text, ${t.attributes} attributes), ${t.runs} re-runs`
      return {
        pass,
        message: () =>
          pass
            ? `expected the interaction to exceed ${limits}, got ${got}`
            : `expected ${limits}, got ${got}. A large count with few visible changes usually means rows were rebuilt or re-run: check for new item identities (W014) or a missing key (W010).`,
      }
    },
  })
}

declare module 'vitest' {
  interface Assertion<R, T> {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): Promise<void>
  }
  interface AsymmetricMatchersContaining {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): void
  }
}
