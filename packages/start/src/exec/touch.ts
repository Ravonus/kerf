import type { Fn } from '../data'
import type { Scope, ScopeOptions, Touched } from './scope'

export const tracker = (scope: Scope): Touched | undefined =>
  scope.options.dev ? { read: new Set(), write: new Set() } : undefined

/** R105 (dev, once per function): a cached Rust query with tags that named no table, so Q011 has nothing to check it by. */
export function untouched(fn: Fn, read: Set<string>, tags: readonly string[], scope: Scope) {
  if (!fn.def.impl || !fn.def.cache || read.size || !tags.length || warned.has(`${fn.$id}:R105`))
    return
  warned.add(`${fn.$id}:R105`)
  scope.options.onDiagnostic?.({
    code: 'R105',
    severity: 'warning',
    message: `\`${fn.$id}\` is cached under ${tags.map((t) => `\`${t}\``).join(', ')} and reported no table: nothing can tell whether those tags cover what it reads. Call \`ctx.touch("table")\` in the Rust, or drop \`tags\` if it reads none`,
  })
}

/** Q011 (dev, once per function and table): a table the function touched that no tag names (PLAN §4). */
export function missedTags(
  fn: Fn,
  verb: 'read' | 'write',
  tables: Set<string>,
  tags: readonly string[],
  scope: Scope,
) {
  for (const t of tables) {
    const key = `${fn.$id}:${t}`
    if (warned.has(key) || tags.some((x) => x === t || x.startsWith(`${t}:`))) continue
    warned.add(key)
    const list = fn.kind === 'query' ? '`tags`' : '`invalidates`'
    scope.options.onDiagnostic?.({
      code: 'Q011',
      severity: 'warning',
      message: `\`${fn.$id}\` ${verb === 'read' ? 'reads' : 'writes'} table \`${t}\`, but its ${list} don't name it: ${fn.kind === 'query' ? "a mutation of that table won't refresh it" : 'queries of that table stay stale'}. Add \`'${t}'\` to ${list}`,
    })
  }
}
const warned = new Set<string>()

/** Dev: the tables each query last read, and the tags of the queries read with `.live()` (the hub fills it). */
export const reads = new Map<string, Set<string>>()
export const liveQueries = new Map<string, string[]>()

/** R003 (dev, once per pair): this mutation wrote what a live query reads, and pokes none of its tags. */
export function missedPokes(fn: Fn, write: Set<string>, tags: string[], scope: Scope) {
  for (const [id, own] of liveQueries) {
    const table = [...(reads.get(id) ?? [])].find((t) => write.has(t))
    const key = `${fn.$id}>${id}`
    if (!table || warned.has(key) || own.some((t) => tags.includes(t))) continue
    warned.add(key)
    scope.options.onDiagnostic?.({
      code: 'R003',
      severity: 'warning',
      message: `\`${fn.$id}\` writes table \`${table}\`, which live query \`${id}\` reads, but their tags don't intersect (${JSON.stringify(tags)} and ${JSON.stringify(own)}): open pages won't update. Add one of the query's tags to \`invalidates\``,
    })
  }
}

/** R012 (dev, once per query and table): a live query whose tags won't hear what `changes` reports, or a table it doesn't report. */
export function missedFeed(
  fn: Fn,
  tags: string[],
  tables: string[],
  report: ScopeOptions['onDiagnostic'],
) {
  for (const t of reads.get(fn.$id) ?? []) {
    const key = `${fn.$id}~${t}`
    const named = tags.some((x) => x === t || x.startsWith(`${t}:`))
    if (warned.has(key) || (named && tables.includes(t))) continue
    warned.add(key)
    report?.({
      code: 'R012',
      severity: 'warning',
      message: tables.includes(t)
        ? `live query \`${fn.$id}\` reads table \`${t}\`, but no tag names it: writes from outside the app won't refresh it. Add \`'${t}'\` to its \`tags\``
        : `live query \`${fn.$id}\` reads table \`${t}\`, which \`changes\` doesn't list: only mutations refresh it, not writes from outside the app. Add the table to \`dbChanges\``,
    })
  }
}
