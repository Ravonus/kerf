// W030 joins server reachability with proven core state calls at module evaluation.
import { diagnostic, positions } from './diag.mjs'
import { serverGraph } from './state-checks/server-graph.mjs'
import { coreState, moduleCalls } from './state-checks/core-state.mjs'

/** State created by a server-reachable module is shared across requests unless explicitly global. */
export function serverStateChecks(root, options) {
  const graph = serverGraph(root, options)
  if (!graph.size) return []
  const resolve = coreState(root, graph)
  const out = []
  for (const [file, { sf, entry }] of graph) {
    const pos = positions(sf.text)
    moduleCalls(sf, (call) => {
      if (!['state', 'linked'].includes(resolve(call.expression))) return
      const start = call.getStart(sf), end = call.end
      out.push(diagnostic({
        code: 'W030',
        severity: 'error',
        file,
        span: pos.span(start, end),
        offset: [start, end],
        why: `This module creates state reachable from server entry \`${entry}\`; requests share it.`,
        help: 'Create state inside a request/component factory or a context owned by the request. '
          + 'Use `state.global` only when sharing across requests is intended.',
      }))
    })
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.offset[0] - b.offset[0])
}
