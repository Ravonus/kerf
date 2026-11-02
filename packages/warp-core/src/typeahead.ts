// Typeahead over a list (APG): keys within 500ms build a prefix, and one letter repeated cycles through what starts with it.
const WINDOW_MS = 500

export function typeahead() {
  let typed = ''
  let typedAt = 0
  return {
    /** True while a prefix is being typed: Space then belongs to it ("New York"), not to the list. */
    get typing() { return !!typed && performance.now() - typedAt < WINDOW_MS },
    /** The item `key` lands on, from the one at `at`; `text` is its label. */
    next<T>(key: string, items: T[], at: number, text: (item: T) => string): T | undefined {
      const now = performance.now()
      const k = key.toLowerCase()
      typed = now - typedAt < WINDOW_MS ? typed + k : k
      typedAt = now
      const prefix = Array.from(typed).every(c => c === k) ? k : typed
      const from = prefix.length === 1 ? at + 1 : Math.max(at, 0)
      return [...items.slice(from), ...items.slice(0, from)].find(i => text(i).trim().toLowerCase().startsWith(prefix))
    },
    clear() { typed = '' },
  }
}
