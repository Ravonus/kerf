import { Button, getDial, Modal, Search, Segmented, Snippet, Tag, VirtualList } from '@weft/warp'
import { derived, onCleanup, onMount, state } from 'weft'
import files from '../generated/icons.json'

type Tier = 'quiet' | 'balanced' | 'vivid'
type Form = 'hollow' | 'solid'
type Set = Record<string, [string, string]>

const TIERS = [{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]
const FORMS = [{ value: 'hollow', label: 'Hollow' }, { value: 'solid', label: 'Solid' }]
const SIZES = [{ value: '16', label: '16' }, { value: '24', label: '24' }, { value: '32', label: '32' }]
/**
 * Each size gets a cell that fits it: the drawing, and a name over two lines. A name breaks only after a hyphen, so the
 * narrowest cell still holds the longest single word, "accessibility", whole.
 */
const CELL: Record<string, { width: number; height: number }> = { '16': { width: 112, height: 84 }, '24': { width: 120, height: 92 }, '32': { width: 128, height: 100 } }
const pascal = (n: string) => n.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase())
const svg = (inner: string) => `<svg data-icon viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`

/** All the icons, and one attribute between tiers: the set is drawings in one file, loaded with the first look. */
/* @weft client */
export function IconBrowser() {
  const set = state<Set | undefined>(undefined)
  const query = state('')
  const tier = state<Tier>('balanced')
  onMount(() => { tier.value = getDial('expression') })
  const form = state<Form>('hollow')
  const size = state('32')
  const width = state(0)
  const cols = derived(() => Math.max(2, Math.floor(width.value / CELL[size.value].width)))
  const open = state(false)
  const picked = state('')
  let box: HTMLDivElement | undefined
  const names = derived(() => {
    const q = query.value.trim().toLowerCase()
    return q ? files.names.filter(n => n.includes(q)) : files.names
  })
  const rows = derived(() => {
    const out: { id: string; names: string[] }[] = []
    for (let i = 0; i < names.value.length; i += cols.value) out.push({ id: `${size.value}:${cols.value}:${i}`, names: names.value.slice(i, i + cols.value) })
    return out
  })
  const drawing = (name: string, f: Form) => svg(set.value?.[name]?.[f === 'solid' ? 1 : 0] ?? '')
  onMount(() => {
    query.value = new URLSearchParams(location.search).get('q') ?? ''
    void fetch(files.url).then(r => r.json()).then(s => (set.value = s))
    const seen = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
    seen.observe(box)
    onCleanup(() => seen.disconnect())
  })
  const show = (name: string) => { picked.value = name; open.value = true }
  // The size is a custom property, not a data-size rule: the build's purge keeps `[data-size=…]` rules only for values it
  // finds as words in the output, and these come from a control, so in a build every size drew at 16px.
  return (
    <div data-site="icons" data-expression={tier.value} style={`--glyph:${size.value}px;--cell:${CELL[size.value].height}px`} ref={box}>
      <div data-part="controls">
        <Search label="Search icons" value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
        <Segmented label="Tier" value={tier.value} onChange={v => (tier.value = v as Tier)} options={TIERS} />
        <Segmented label="Form" value={form.value} onChange={v => (form.value = v as Form)} options={FORMS} />
        <Segmented label="Size" value={size.value} onChange={v => (size.value = v)} options={SIZES} />
      </div>
      <p data-part="count" aria-live="polite">{names.value.length === files.names.length ? `${files.names.length} icons` : `${names.value.length} of ${files.names.length}`}</p>
      <VirtualList items={rows.value} rowKey={r => r.id} estimate={CELL[size.value].height} label="Icons" bareRows initial={8}>
        {row => (
          <div data-part="line" style={`--cols:${cols.value}`}>
            {row().names.map(n => (
              <Button key={n} emphasis="ghost" tone="neutral" data-part="cell" onClick={() => show(n)} aria-label={n}>
                <span data-part="glyph" innerHTML={drawing(n, form.value)}></span>
                <span data-part="name">{n.split('-').map((w, i, all) => (i < all.length - 1 ? [`${w}-`, <wbr />] : w))}</span>
              </Button>
            ))}
          </div>
        )}
      </VirtualList>
      <Modal open={open} title={picked.value}>
        <div data-site="icon-sheet">
          {['quiet', 'balanced', 'vivid'].map(t => (
            <div key={t} data-expression={t}>
              <Tag>{t}</Tag>
              <span data-part="glyph"
                // oxlint-disable-next-line weft/no-html-sink -- this site's own icon set, wrapped in a fixed svg
                innerHTML={drawing(picked.value, 'hollow')}></span>
              <span data-part="glyph"
                // oxlint-disable-next-line weft/no-html-sink -- this site's own icon set, wrapped in a fixed svg
                innerHTML={drawing(picked.value, 'solid')}></span>
            </div>
          ))}
        </div>
        <Snippet code={`import { ${pascal(picked.value)}Icon, ${pascal(picked.value)}IconSolid } from '@weft-js/warp-icons'`} />
      </Modal>
    </div>
  )
}
