// Generate N realistic weft components (props, state, derived, keyed lists, conditionals, handlers, children).
// Usage: node scripts/gen-corpus.mjs [n=1000] [dir=bench/corpus]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const n = Number(process.argv[2] ?? 1000)
const dir =
  process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'bench', 'corpus')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

let seed = 42
const rand = (k) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k
const pick = (xs) => xs[rand(xs.length)]
const nouns = [
  'Order',
  'Invoice',
  'Ticket',
  'Track',
  'Photo',
  'Task',
  'Note',
  'Room',
  'Device',
  'Lesson',
]
const fields = ['title', 'status', 'owner', 'price', 'count', 'label', 'updated', 'score']

function component(i) {
  const N = pick(nouns) + i
  const f = [pick(fields), pick(fields), pick(fields)]
  const rows = 1 + rand(3)
  const lists = Array.from(
    { length: rows },
    (_, r) => `
      <ul aria-label="${N} list ${r}">
        {shown.value.map(item => (
          <li key={item.id} class={item.id === selected.value ? 'on' : 'off'}>
            <span>{item.${f[0]}}</span>
            <span>{format(item.${f[1]})}</span>
            {item.${f[2]} ? <em>{String(item.${f[2]})}</em> : null}
            <button aria-label={\`Pick \${item.id}\`} onClick={() => (selected.value = item.id)}>Pick</button>
          </li>
        ))}
      </ul>`,
  ).join('')
  return `import { derived, state, watch } from '@weft-js/core'
import { format } from './format'

type Item = { id: string; ${fields.map((x) => `${x}: string | number`).join('; ')} }
type Props = { items: Item[]; title: string; limit?: number; onPick?: (id: string) => void; tone?: 'quiet' | 'loud' }

export function ${N}({ items, title, limit = 20, onPick, tone = 'quiet' }: Props) {
  const query = state('')
  const selected = state<string | null>(null)
  const open = state(${rand(2) ? 'true' : 'false'})
  const shown = derived(() =>
    items
      .filter(item => String(item.${f[0]}).toLowerCase().includes(query.value.toLowerCase()))
      .slice(0, limit),
  )
  const total = derived(() => shown.value.reduce((sum, item) => sum + Number(item.${f[1]} || 0), 0))
  watch(() => selected.value, id => { if (id && onPick) onPick(id) })

  return (
    <section class={tone} data-open={open.value}>
      <header>
        <h2>{title} ({shown.value.length})</h2>
        <button aria-expanded={open.value} onClick={() => (open.value = !open.value)}>{open.value ? 'Hide' : 'Show'}</button>
      </header>
      <label>Filter <input value={query.value} onInput={e => (query.value = e.currentTarget.value)} /></label>
      {open.value && (
        <div>${lists}
          <p>Total: {format(total.value)}</p>
          {shown.value.length === 0 ? <p>Nothing matches “{query.value}”.</p> : null}
        </div>
      )}
    </section>
  )
}
`
}

for (let i = 0; i < n; i++)
  writeFileSync(join(dir, `C${String(i).padStart(4, '0')}.tsx`), component(i))
// What the components import, so the corpus also runs (test/oracle.test.tsx), not only compiles.
writeFileSync(
  join(dir, 'format.ts'),
  `export const format = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : String(v ?? ''))\n`,
)
console.log(`wrote ${n} components to ${dir}`)
