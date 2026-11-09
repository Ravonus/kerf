// The Theming section of a component page: which `warp({ parts })` keys style it, what each takes beyond the shared
// properties, and in which states. Read from warp's own parts table, so the docs can't drift from the plugin.
import { PARTS, statesOf } from '../../../packages/warp/src/plugin/theme-parts.mjs'

// One config per part, as a reader would write it. A part without one gets the shape-only fallback.
const EXAMPLES = {
  button:
    "button: { bg: 'brand', text: 'ink', radius: 'pill', hover: { bg: 'ink', text: 'white' } }",
  iconButton: 'iconButton: { radius: 8, icon: 18 }',
  copy: "copy: { radius: 'pill' }",
  close: 'close: { size: 28 }',
  link: "link: { text: 'brand', underline: { color: 'brand', width: 2, hover: { width: 3 } } }",
  nav: "nav: { gap: 24, item: { hover: { text: 'brand' } }, underline: { color: 'brand', width: 3 } }",
  tabs: "tabs: { tab: { active: { text: 'brand' } }, underline: { color: 'brand', width: 3 } }",
  badge: "badge: { radius: 'pill', case: 'uppercase', tracking: 0.5 }",
  chip: "chip: { radius: 6, hover: { border: 'brand' } }",
  card: "card: { padding: 32, radius: 20, shadow: 'md' }",
  field: "field: { radius: 4, label: { focus: { text: 'brand' } } }",
  sweep: "sweep: { stroke: 'brand', width: 2, duration: 400 }",
  dialog: "dialog: { radius: 24, padding: 'group' }",
  sheet: 'sheet: { radius: 24 }',
  popover: "popover: { radius: 12, shadow: 'lg' }",
  toast: "toast: { radius: 'pill' }",
}

/** The rows and an example for `component`, or undefined when no part names it. */
export function themingOf(component) {
  const rows = []
  for (const [name, spec] of Object.entries(PARTS)) {
    if (!spec.for?.includes(component)) continue
    const row = (path, s) =>
      rows.push({
        path,
        own: Object.keys(s.props ?? {}),
        states: statesOf(s),
      })
    row(name, spec)
    for (const [sub, inner] of Object.entries(spec.sub ?? {})) row(`${name}.${sub}`, inner)
  }
  if (!rows.length) return undefined
  const parts = [...new Set(rows.map((r) => r.path.split('.')[0]))]
  const lines = parts.map((p) => `    ${EXAMPLES[p] ?? `${p}: { radius: 12, padding: 16 }`},`)
  return {
    rows,
    example: `warp({\n  colors: { brand: '#e8590c', ink: '#1b1b1f' },\n  parts: {\n${lines.join('\n')}\n  },\n})`,
  }
}
