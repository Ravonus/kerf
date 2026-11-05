/** What an HTML string holds for CSS pruning: tags, classes, ids and attributes. */
export function markup(html: string): Set<string>
/** Escape &, < and double quotes by default; text escapes &, < and >; full escapes all four. */
export function esc(text: string, context?: 'attribute' | 'text' | 'full'): string
