// Docs for agents: topic files in ../docs, plus pages generated from the installed weft (diagnostics, commands,
// AGENTS.md). One source for `weft docs`, the MCP `docs` tool and AGENTS.md, so they can't disagree.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalog, entry, probe } from './catalog.mjs'
import { tasks } from './tasks.mjs'
import { probeTests } from './tests.mjs'
import { exportsOf, loadCompiler, resolveWeft } from './weft.mjs'

const docsDir = fileURLToPath(new URL('../docs/', import.meta.url))
const fileTopics = Object.fromEntries(readdirSync(docsDir).filter(f => f.endsWith('.md')).map(f => [f.slice(0, -3), f]))

export const topics = {
  rules: 'The seven rules: boxes, derived, live JSX and props, run-once bodies (start here)',
  props: 'How props stay live; W001, W005, W006',
  lists: 'Keyed lists, conditionals and stable items; W010, W011, W013, W014',
  async: 'resource, <Boundary pending error>, weft/ssr and hydrate; W012',
  testing: 'weft/test: render, screen, user, flush, clock, touches and toTouchAtMost(n, { runs }); T001–T009',
  config: 'weft.config.ts: scope, tasks, environments, reserved plugins/slots; P-codes',
  diagnostics: 'Every W-, T- and P-code, and which ones the installed weft reports',
  commands: "This project's commands and tasks (from `weft tasks`)",
  agents: 'The generated AGENTS.md',
}

const probes = new Map()

/** What the installed weft offers: version, exports, and which catalog codes its compiler reports. */
export function installed(root) {
  const weft = resolveWeft(root)
  if (!probes.has(weft.compilerPath)) probes.set(weft.compilerPath, { ...probe(loadCompiler(weft)), ...probeTests(catalog) })
  return { weft, exports: exportsOf(weft), status: probes.get(weft.compilerPath) }
}

function status(code, info) {
  const e = entry(code)
  const st = info.status[e.code]
  if (e.by === 'compiler') return st?.implemented ? `reported${st.autofix ? ', safe autofix' : st.suggestion ? ', suggested edit' : ''}` : 'not reported by this weft yet'
  if (/^T/.test(e.code)) return st?.implemented ? `reported by weft check on test files${st.autofix ? ', safe autofix' : st.suggestion ? ', suggested edit' : ''}` : 'not reported by this weft yet'
  if (e.by === 'cli') return e.proposed ? 'reported by weft check (proposed code, research 17)' : 'reported by weft check'
  return 'reserved'
}

function codePage(code, info) {
  const e = entry(code)
  const lines = [`# ${code} (${e.severity})`, '', e.catches + '.', '', `**Fix:** ${e.fix}.`, '', `**Status in weft@${info.weft.version}:** ${status(code, info)}.`]
  if (e.example) lines.push('', 'Triggers it:', '', '```tsx', e.example, '```')
  if (/^T/.test(code)) lines.push('', 'A test that needs it on purpose keeps it with a reason: `// weft-allow ' + code + ': <why>` in the file header (whole file) or on the line above.')
  const topic = Object.entries(topics).find(([, d]) => d.includes(code)) ?? (/^T/.test(code) ? ['testing'] : undefined)
  if (topic) lines.push('', `More: \`weft docs ${topic[0]}\`.`)
  return lines.join('\n')
}

function diagnosticsPage(info) {
  const rows = catalog.map(e => `| ${e.code} | ${e.severity} | ${e.catches} | ${e.fix} | ${status(e.code, info)} |`)
  return [`# Diagnostics (weft@${info.weft.version})`, '', '| Code | Severity | Catches | Fix | Status |', '|---|---|---|---|---|', ...rows].join('\n')
}

export function commandsPage(list) {
  const rows = list.tasks
    .filter(t => t.available)
    .map(t => `| \`${t.command}\` | ${t.description ?? '(no description: P004)'} | ${t.sideEffects?.length ? t.sideEffects.join(', ') : 'none'} |`)
  const planned = list.tasks.filter(t => !t.available).map(t => `\`${t.name}\``)
  return ['| Command | Does | Side effects |', '|---|---|---|', ...rows, '', planned.length ? `Planned, not shipped yet: ${planned.join(', ')}.` : ''].join('\n').trim()
}

/**
 * @param {string} root
 * @param {string} [topic] a topic name or a diagnostic code; omitted: the index
 * @returns {Promise<{ topic: string, text: string, topics?: Record<string, string> }>}
 */
export async function docs(root, topic) {
  root = resolve(root)
  const key = (topic ?? 'index').trim()
  if (key === 'index') {
    const text = ['# weft docs', '', ...Object.entries(topics).map(([t, d]) => `- \`${t}\`: ${d}`), '', 'Any diagnostic code works too: `W014`, `T003`, `P004`.'].join('\n')
    return { topic: 'index', text, topics }
  }
  const info = installed(root)
  if (/^[WPT]\d{3}$/i.test(key)) {
    const code = key.toUpperCase()
    if (!entry(code)) throw Object.assign(new Error(`unknown diagnostic code ${code}`), { code: 'E_UNKNOWN_TOPIC' })
    return { topic: code, text: codePage(code, info) }
  }
  if (key === 'diagnostics') return { topic: key, text: diagnosticsPage(info) }
  if (key === 'commands') return { topic: key, text: `# Commands\n\n${commandsPage(await tasks(root))}` }
  if (key === 'agents') {
    const { agentsMd } = await import('./agents-md.mjs')
    return { topic: key, text: (await agentsMd(root)).text }
  }
  if (fileTopics[key]) {
    const text = readFileSync(resolve(docsDir, fileTopics[key]), 'utf8').trim()
    return { topic: key, text: key === 'rules' ? `# The rules\n\n${text}` : text }
  }
  throw Object.assign(new Error(`unknown docs topic "${key}"; topics: ${Object.keys(topics).join(', ')}, or a code like W014`), { code: 'E_UNKNOWN_TOPIC' })
}

export const readDoc = name => readFileSync(resolve(docsDir, `${name}.md`), 'utf8').trim()
