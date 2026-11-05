import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docs as weftDocs } from '../../../packages/cli/src/docs.mjs'
import { catalog } from '../../../packages/cli/src/catalog.mjs'
import { markdownToHtml, site, repo, out } from './context.mjs'

/** warp's three areas of the site, by the group's file. Everything else is core components. */
const AREAS = {
  charts: 'charts',
  agent: 'blocks',
  admin: 'blocks',
  collab: 'blocks',
  flow: 'blocks',
  live: 'blocks',
  schedule: 'blocks',
}
const areaOf = (file) => AREAS[file] ?? 'components'
// Every page says something here: these are for the pages with no keyboard table or notes of their own.
const CHART_ACCESS =
  'Every chart has a text alternative and a table view of its numbers, so nothing depends on seeing the marks. See [Chart](/charts/chart) for its keyboard support.'
const QUIET_ACCESS =
  "This has no shortcuts of its own: controls inside it use Tab, Enter and Space as usual, and warp's parts keep their roles and labels."
const hrefs = new Map()
/** A `/toolkit/x` written anywhere in the words, as the page's real address. Paths like src/toolkit are left alone. */
const live = (text) =>
  text.replace(/(?<![\w.-])\/toolkit(?:\/([a-z0-9-]+))?(?![\w.-]*\/)/g, (all, slug) =>
    slug ? (hrefs.get(slug) ?? (slug === 'art' ? '/art' : `/components/${slug}`)) : '/components',
  )
const write = (file, value) => writeFileSync(join(out, file), live(JSON.stringify(value)))

const readData = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'))

/** The stack comparison, from benchmarks/compare/results.json and the run that wrote it. */
function numbers() {
  const results = readData('benchmarks/compare/results.json')
  const run = readFileSync(join(repo, 'evals/results/compare-history.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1)
  // a stack only in the design scenario (weft-tailwind) has no dashboard numbers
  const stacks = Object.entries(results)
    .filter(([, s]) => s.size)
    .map(([id, s]) => ({
      id,
      label: s.label,
      js: s.size.js.br,
      css: s.size.css.br,
      lines: s.lines,
      nodes: s.load.nodes,
      heap: s.load.heapMB,
      fcp: s.load.fcpMs,
      steps: Object.fromEntries(Object.entries(s.parity.steps).map(([k, v]) => [k, v.dom])),
    }))
  return { stacks, at: run.at.slice(0, 10), commit: run.commit, codes: catalog.length }
}

const file = (path) => () => readFileSync(join(repo, path), 'utf8')
const topic = (name) => async () => (await weftDocs(site, name)).text

/**
 * The opening line of a page that starts straight in. `weft docs` is read by agents, whose context pays for every word, so
 * these say what a page is for to someone arriving here, and stay out of that source.
 */
/** Pages whose first paragraph is mostly code, so their `meta` is written here. */
const SUMMARIES = {
  props:
    'How a component reads its props: why they stay live, how to destructure them, and when to pass a box instead.',
}

const LEADS = {
  rules:
    'Nine rules cover how every weft component behaves. The example below uses most of them. Nearly all carry a code, so when you break one, the build names it and says how to fix it.',
  lists:
    'Lists and conditionals work as they do in React: `.map` with a `key`, `&&` and ternaries. This page covers the mistakes to avoid and the few habits that keep a long list fast.',
  async:
    'Load data with `resource`, and say what to show while it loads with `Boundary`. On the server, weft can wait for that data so the first page arrives filled in.',
  start:
    '`@weft-js/start` is the full-stack part of weft: routes from files, server functions, a database, auth and realtime. A new app from `create-weft` already has it.',
  browser:
    "`@weft-js/core/browser` gives you the browser's changing values, such as being online or a tab being visible, as values you read in JSX. It handles the listeners and the cleanup.",
  testing:
    '`@weft-js/core/test` renders components under vitest and drives them as a user would. `weft check` also flags tests that would pass whatever the code did.',
}

/**
 * Reference: exact API, commands, config and codes. A page's source is `weft docs <topic>` wherever one exists, so the site
 * and the CLI read one file. Teaching goes in Learn (LEARN below), never here.
 */
const SECTIONS = [
  [
    'Core',
    [
      ['rules', 'The rules', topic('rules')],
      ['state', 'State', topic('state')],
      ['props', 'Props', topic('props')],
      ['lists', 'Lists', topic('lists')],
      ['async', 'Async', topic('async')],
      ['browser', 'Browser APIs', topic('browser')],
      ['ui-state', 'Shared UI state', topic('ui-state')],
      ['testing', 'Testing', topic('testing')],
    ],
  ],
  [
    'Full stack',
    [
      ['start', 'Full stack', topic('start')],
      ['meta', 'Metadata and cards', topic('meta')],
      ['rust', 'Rust', topic('rust')],
      ['pay', 'Payments', file('packages/pay/docs/pay.md')],
    ],
  ],
  [
    'Styling',
    [
      ['style', 'Style groups', topic('style')],
      ['design', 'Design language', topic('design')],
      ['icons', 'Icons', topic('icons')],
      ['fonts', 'Fonts', topic('fonts')],
      ['surface', 'Surfaces', topic('surface')],
    ],
  ],
  [
    'Tooling',
    [
      ['config', 'Configuration', topic('config')],
      ['plugins', 'Plugins', topic('plugins')],
      ['verify', 'Check your work', topic('verify')],
      ['agents', 'AGENTS.md', topic('agents')],
      ['diagnostics', 'Diagnostics', () => diagnosticsIndex()],
    ],
  ],
  ['Migrate', [['react', 'From React', file('docs/react-props.md')]]],
]

/**
 * Learn: the tutorial, in teaching order. Each page is `site/content/learn/<slug>.md`, read top to bottom. A chapter's first
 * page, when its slug is the chapter's own (see OVERVIEW), previews every page after it.
 */
const LEARN = [
  [
    'Get started',
    [
      ['quick-start', 'Quick start'],
      ['tutorial', 'Tutorial: a shop with a server'],
      ['thinking-in-weft', 'Thinking in weft'],
      ['installation', 'Installation'],
      ['setup', 'Editor and TypeScript setup'],
      ['diagnostics', 'Diagnostics and weft check'],
      ['working-with-agents', 'Working with AI agents'],
    ],
  ],
  [
    'Describing the UI',
    [
      ['describing-the-ui', 'Describing the UI'],
      ['your-first-component', 'Your first component'],
      ['importing-and-exporting', 'Importing and exporting components'],
      ['writing-markup-with-tsx', 'Writing markup with TSX'],
      ['javascript-in-tsx', 'JavaScript in TSX with braces'],
      ['passing-props', 'Passing props'],
      ['conditional-rendering', 'Conditional rendering'],
      ['rendering-lists', 'Rendering lists'],
      ['components-run-once', 'Components run once'],
      ['your-ui-as-a-tree', 'Your UI as a tree'],
    ],
  ],
  [
    'Adding interactivity',
    [
      ['adding-interactivity', 'Adding interactivity'],
      ['responding-to-events', 'Responding to events'],
      ['state', 'State: a box with .value'],
      ['how-updates-reach-the-dom', 'How an update reaches the DOM'],
      ['updating-objects-and-arrays', 'Updating objects and arrays'],
      ['bind', 'Writing to a parent with bind:'],
      ['forms-and-inputs', 'Forms and inputs'],
    ],
  ],
  [
    'Managing state',
    [
      ['managing-state', 'Managing state'],
      ['reacting-to-input', 'Reacting to input with state'],
      ['choosing-state-structure', 'Choosing the state structure'],
      ['derived', 'Derived values'],
      ['sharing-state', 'Sharing state between components'],
      ['passing-data-deeply', 'Passing data deeply'],
      ['entries', 'Keyed state and entries'],
      ['ui-state', 'Hover, focus and shared UI state'],
      ['app-wide-state', 'App-wide state with defineState'],
    ],
  ],
  [
    'Escape hatches',
    [
      ['escape-hatches', 'Escape hatches'],
      ['refs-and-the-dom', 'Refs and the DOM'],
      ['effects', 'Effects'],
      ['you-might-not-need-an-effect', 'You might not need an effect'],
      ['cleanup-and-ownership', 'Cleanup and ownership'],
      ['reusing-logic', 'Reusing logic'],
      ['async-and-loading', 'Async and loading states'],
      ['text-media-and-shapes', 'Text, media and shapes'],
    ],
  ],
  [
    'Full-stack apps',
    [
      ['full-stack', 'Full-stack apps'],
      ['routing-and-layouts', 'Routing and layouts'],
      ['loading-data', 'Loading data'],
      ['server-functions', 'Server functions'],
      ['database', 'Database'],
      ['auth', 'Auth'],
      ['forms-and-validation', 'Forms and validation'],
      ['live-data', 'Realtime and live data'],
      ['uploads-and-media', 'Uploads and media'],
      ['payments', 'Payments'],
      ['metadata-and-share-images', 'Metadata and share images'],
      ['ssr-and-hydration', 'SSR, islands and hydration'],
      ['deploying', 'Runtimes and deploying'],
    ],
  ],
  [
    'Styling and warp',
    [
      ['styling-and-warp', 'Styling and warp'],
      ['styling', 'Styling and style groups'],
      ['warp', 'Using warp'],
      ['theming', 'Theming'],
      ['icons', 'Icons'],
      ['fonts', 'Fonts'],
      ['accessibility', 'Accessibility'],
    ],
  ],
  [
    'Testing and tooling',
    [
      ['testing-and-tooling', 'Testing and tooling'],
      ['testing', 'Testing'],
      ['plugins', 'Plugins'],
      ['performance', 'Performance and bundle size'],
      ['rust', 'Rust, in depth'],
    ],
  ],
]
/** A chapter's overview page: the one whose slug is the chapter's name. Get started has /learn itself. */
const overviewOf = (section, items) =>
  items.find(([slug]) => slug === slugify(section.replace(/ apps$/, '')))?.[0]
/** Learn pages that moved, old slug to new. src/routes/learn answers each with a 308, `.md` twins included. */
const MOVED = { 'lists-and-conditions': 'rendering-lists' }

function diagnosticsIndex() {
  const families = {
    W: 'Compiler',
    D: 'Design',
    T: 'Tests',
    P: 'Plugins and config',
    H: 'Head and metadata',
    Q: 'Queries',
    S: 'State',
    F: 'Forms',
    I: 'Icons',
    A: 'Auth',
    C: 'Contracts',
    R: 'Realtime',
    X: 'Surfaces and fonts',
    M: 'Media',
  }
  const lines = [
    '# Diagnostics',
    '',
    `Every code weft reports, ${catalog.length} in all. \`weft docs <code>\` prints the same page.`,
    '',
  ]
  for (const [letter, name] of Object.entries(families)) {
    const list = catalog.filter((e) => e.code[0] === letter)
    if (!list.length) continue
    lines.push(`## ${name}`, '', '| Code | Catches |', '|---|---|')
    for (const e of list)
      lines.push(`| \`${e.code}\` | ${e.catches.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)
    lines.push('')
  }
  return lines.join('\n')
}

const slugify = (t) =>
  t
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** One line of words: `code` becomes code, and nothing else is expected. */
const inline = (md) => markdownToHtml(md).replace(/^\s*<p[^>]*>|<\/p>\s*$/g, '')

export {
  areaOf,
  CHART_ACCESS,
  QUIET_ACCESS,
  hrefs,
  write,
  readData,
  numbers,
  SUMMARIES,
  LEADS,
  SECTIONS,
  LEARN,
  overviewOf,
  MOVED,
  inline,
  slugify,
}
