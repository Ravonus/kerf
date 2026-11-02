// Docs for agents: topic files in ../docs, plus pages generated from the installed weft (diagnostics, commands,
// AGENTS.md). One source for `weft docs`, the MCP `docs` tool and AGENTS.md, so they can't disagree.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalog, entry, probe } from './catalog.mjs'
import { loadConfig } from './load-config.mjs'
import { tasks } from './tasks.mjs'
import { probeTests } from './tests.mjs'
import { exportsOf, loadCompiler, resolveWeft } from './weft.mjs'

const docsDir = fileURLToPath(new URL('../docs/', import.meta.url))
const fileTopics = Object.fromEntries(readdirSync(docsDir).filter(f => f.endsWith('.md')).map(f => [f.slice(0, -3), f]))

/** What `weft docs` can show, with the line that says what each topic covers. */
export const topics = {
  rules: 'The nine rules: boxes, derived, live JSX and props, run-once bodies (start here)',
  state: 'Every reactive function (state, derived, watch, untrack, flush, batch, context) and defineState with persist, sync and history; S001, S002, S008, S009, S012, S013',
  props: 'How props stay live; W001, W005, W006',
  lists: 'Keyed lists, conditionals and stable items; W010, W011, W013, W014',
  async: 'resource, <Boundary pending error>, @weft-js/core/ssr and hydrate; W012',
  start: 'full stack: routes, load, query, mutation, the database, auth, realtime, runtimes; Q001–Q016, A001–A004, C001–C002, F001–F003, R001–R023',
  rust: 'Rust bodies: native() addons with a WASM fallback, remote() sidecars, weft add rust, impl, the weft crate, build.rs, Ctx, touch, weft dev reload, deployment; R101–R109',
  plugins: 'Build a plugin: slots, server extensions, check hooks, docs, `weft add`, conformance. Walks through how @weft-js/pay is built',
  testing: '@weft-js/core/test: render, screen, user, flush, clock, touches and toTouchAtMost(n, { runs }); T001–T009',
  browser: '@weft-js/core/browser: online, visible, lifecycle, media, on, interval; the net/page fakes; W050, W051, W054, W056, T012',
  'ui-state': 'Hover, press and focus as state: interaction(), the ui prop, sharing across tabs and clients, realtime({ share }); U001–U005',
  surface: '@weft-js/core/surface: canvas and WebGL as layout children: defineSurface, <Surface>, s.draw, s.frame, s.text, the clock; X001–X004, X009–X012',
  verify: 'Check your work: drive the running app (weft browser / __weft__.agent: snapshot with the live graph, act, assert, clock, network, record) and the test gate; T010, T011, T020',
  icons: '@weft-js/warp-icons: per-icon exports, iconSet, the three tiers, icons({ tier }), sizes',
  fonts: 'Fonts with @weft-js/text: text({ fonts }), what the build makes, using a face in CSS, budgets; X020, X021, X022, X023',
  meta: 'Page metadata and share cards: route `meta`, what is automatic, `site.url`, `.og.tsx`, `weft routes --meta`; H001–H008, H011–H016',
  config: 'weft.config.ts: scope, tasks, environments, reserved plugins/slots; P-codes',
  design: 'The design language: Stack, Row, Heading, Text, Link, the closed vocabulary, `weft fix`, `weft tokens`; D001–D007, D011, D030–D039',
  style: 'Style groups (@weft-js/core/style): group(), axes, parts, accents, weft style find/explain, .weft/styles.json; D020–D025, W060',
  diagnostics: 'Every W-, T-, P-, H- and D-code, and which ones the installed weft reports',
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
  if (e.by === 'test') return 'reported by @weft-js/core/test after each test'
  if (e.by === 'gate') return 'reported by `weft test --gate` on a diff'
  if (e.code.startsWith('T')) return st?.implemented ? `reported by weft check on test files${st.autofix ? ', safe autofix' : st.suggestion ? ', suggested edit' : ''}` : 'not reported by this weft yet'
  if (e.by === 'start') return 'reported by @weft-js/start when it serves or renders the route, and by weft check and `weft routes --meta`'
  if (e.by === 'cli' && e.code.startsWith('H')) return 'reported by weft check and by `weft routes --meta`, per route, on what the routes produce'
  if (e.by === 'cli') return e.proposed ? 'reported by weft check (proposed code, research 17)' : 'reported by weft check'
  if (e.by === 'runtime') return 'reported in dev by the runtime (a console warning)'
  if (e.by === 'plugin') return `reported by weft check when \`${e.owner}\` is in \`plugins\``
  return 'reserved'
}

function codePage(code, info) {
  const e = entry(code)
  const lines = [`# ${code} (${e.severity})`, '', e.catches + '.', '', `**Fix:** ${e.fix}.`, '', `**Status in weft@${info.weft.version}:** ${status(code, info)}.`]
  if (e.example) lines.push('', 'Triggers it:', '', '```tsx', e.example, '```')
  if (code.startsWith('T')) lines.push('', 'A test that needs it on purpose keeps it with a reason: `// weft-allow ' + code + ': <why>` in the file header (whole file) or on the line above.')
  const topic = Object.entries(topics).find(([, d]) => d.includes(code)) ?? (code.startsWith('T') ? ['testing'] : undefined)
  if (topic) lines.push('', `More: \`weft docs ${topic[0]}\`.`)
  return lines.join('\n')
}

const contributed = async root => (await loadConfig(root)).contributions

/** What this app's plugins add to the docs (`docs` and `diagnostics` in their manifests). */
const pluginDocs = async root => (await contributed(root)).flatMap(c => (c.manifest.docs ? [c.manifest.docs] : []))
const pluginCodes = async root => (await contributed(root)).flatMap(c => (c.manifest.diagnostics ?? []).map(d => ({ ...d, plugin: c.name })))

function diagnosticsPage(info, own = []) {
  const rows = [...catalog.map(e => `| ${e.code} | ${e.severity} | ${e.catches} | ${e.fix} | ${status(e.code, info)} |`), ...own.map(d => `| ${d.code} | ${d.severity ?? 'error'} | ${d.catches} | ${d.fix} | from \`${d.plugin}\` |`)]
  return [`# Diagnostics (weft@${info.weft.version})`, '', '| Code | Severity | Catches | Fix | Status |', '|---|---|---|---|---|', ...rows].join('\n')
}

export function commandsPage(list, { planned: showPlanned = true } = {}) {
  const rows = list.tasks
    .filter(t => t.available)
    .map(t => `| \`${t.command}\` | ${t.description ?? '(no description: P004)'} | ${t.sideEffects?.length ? t.sideEffects.join(', ') : 'none'} |`)
  const planned = list.tasks.filter(t => !t.available).map(t => `\`${t.name}\``)
  return ['| Command | Does | Side effects |', '|---|---|---|', ...rows, '', showPlanned && planned.length ? `Planned, not shipped yet: ${planned.join(', ')}.` : ''].join('\n').trim()
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
    const all = { ...topics, ...Object.fromEntries((await pluginDocs(root)).map(d => [d.topic, d.summary])) }
    const text = ['# weft docs', '', ...Object.entries(all).map(([t, d]) => `- \`${t}\`: ${d}`), '', 'Any diagnostic code works too: `W014`, `T003`, `P004`, `D025`, `Q001`.'].join('\n')
    return { topic: 'index', text, topics: all }
  }
  const info = installed(root)
  if (/^[A-Z]{1,5}\d{3}$/i.test(key)) {
    const code = key.toUpperCase()
    const own = !entry(code) && (await pluginCodes(root)).find(d => d.code === code)
    if (own) return { topic: code, text: `# ${code} (${own.severity ?? 'error'})\n\n${own.catches}.\n\n**Fix:** ${own.fix}.\n\nReported by weft check, from \`${own.plugin}\`.` }
    if (!entry(code)) throw Object.assign(new Error(`unknown diagnostic code ${code}`), { code: 'E_UNKNOWN_TOPIC' })
    return { topic: code, text: codePage(code, info) }
  }
  if (key === 'diagnostics') return { topic: key, text: diagnosticsPage(info, await pluginCodes(root)) }
  if (key === 'commands') return { topic: key, text: `# Commands\n\n${commandsPage(await tasks(root))}` }
  if (key === 'agents') {
    const { agentsMd } = await import('./agents-md.mjs')
    return { topic: key, text: (await agentsMd(root)).text }
  }
  const page = (await pluginDocs(root)).find(d => d.topic === key)
  if (page) return { topic: key, text: readFileSync(page.file, 'utf8').trim() }
  if (fileTopics[key]) {
    const text = readFileSync(resolve(docsDir, fileTopics[key]), 'utf8').trim()
    return { topic: key, text: key === 'rules' ? `# The rules\n\n${text}` : text }
  }
  throw Object.assign(new Error(`unknown docs topic "${key}"; topics: ${Object.keys(topics).join(', ')}, or a code like W014`), { code: 'E_UNKNOWN_TOPIC' })
}

export const readDoc = name => readFileSync(resolve(docsDir, `${name}.md`), 'utf8').trim()
