import { Button, Input, Segmented, Select, Slider, Switch } from '@weft-js/warp'
import { highlight } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack } from '@weft-js/core'
import { render } from '@weft-js/core/dom'
import { previews } from '../generated/previews'
import type { Knob, Playground as Play } from '../toolkit/types'

export type ShownPlayground = Omit<Play, 'knobs'> & { knobs: (Knob & { control: NonNullable<Knob['control']>; label: string; initial: unknown }) [] }
type Values = Record<string, unknown>

const startOf = (play: ShownPlayground): Values => Object.fromEntries(play.knobs.map(k => [k.prop, k.initial]))

/** The call the knobs describe: only what differs from the component's own default, in knob order. */
function print(play: ShownPlayground, name: string, v: Values) {
  const attrs = play.knobs.filter(k => k.prop !== 'children' && shown(k, v) && v[k.prop] !== k.default && v[k.prop] !== undefined && v[k.prop] !== '' && !(v[k.prop] === false && k.default === undefined)).map(k => {
    const x = v[k.prop]
    return x === true ? ` ${k.prop}` : typeof x === 'string' ? ` ${k.prop}="${x}"` : ` ${k.prop}={${JSON.stringify(x)}}`
  }).join('')
  const c = v.children
  const kids = c == null ? '' : typeof c === 'string' ? c : JSON.stringify(c)
  const line = (kids ? play.code : play.code.replace(/>\{children\}<\/[\w.]+>/, ' />')).replace('{props}', () => attrs).replace('{children}', () => kids)
  return `import { ${name} } from '@weft-js/warp'\n\n${line}`
}

const shown = (k: Knob, v: Values) => !k.when || k.when.is.includes(v[k.when.prop])

/** A picked option as the knob wrote it, since `size={100}` and `size="100"` are different calls. */
const option = (k: Knob, raw: string): unknown => k.options?.find(o => String(o) === raw) ?? raw

function KnobControl(props: { knob: ShownPlayground['knobs'][number]; values: { value: Values }; set: (prop: string, value: unknown) => void }) {
  const k = untrack(() => props.knob)
  const options = (k.options ?? []).map(o => ({ value: String(o), label: String(o) }))
  const value = derived(() => props.values.value[k.prop])
  const text = derived(() => (value.value == null ? '' : String(value.value as string | number | boolean)))
  const number = derived(() => Number(value.value))
  if (k.control === 'switch') return <Switch checked={!!value.value} onChange={(e: Event) => props.set(k.prop, (e.target as HTMLInputElement).checked)}>{k.label}</Switch>
  // A button per option, with the same choice as a dropdown beside it for when no even grid of them fits (wrap()).
  if (k.control === 'segmented') return <><span data-part="knob-label">{k.label}</span><Segmented size="sm" label={k.label} value={text.value} options={options} onChange={(v: string) => props.set(k.prop, option(k, v))} /><Select label={k.label} value={text.value} options={options} onValueChange={(v: string | null) => props.set(k.prop, v === null ? v : option(k, v))} /></>
  if (k.control === 'select') return <Select label={k.label} value={text.value} options={options} onValueChange={(v: string | null) => props.set(k.prop, v === null ? v : option(k, v))} />
  if (k.control === 'slider') return <Slider label={k.label} value={number.value} min={k.min} max={k.max} step={k.step} onChange={(v: number) => props.set(k.prop, v)} />
  return <Input label={k.label} value={text.value} onInput={(e: Event) => props.set(k.prop, (e.target as HTMLInputElement).value)} />
}

/* @weft visible */
/**
 * The page's "Try it": the component large on a stage, the controls that change it beside it (below it on a phone),
 * and the call they add up to under both, live and copyable. Any change makes the example
 * again, since some props are fixed at creation; changes in one frame are coalesced so a slider stays smooth. The URL
 * holds what differs from the start, so a state can be linked.
 */
export function Playground(props: { file: string; name: string; play: ShownPlayground; flow?: string }) {
  const play = props.play
  const seed = untrack(() => startOf(props.play))
  const values = state<Values>(seed)
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let host!: HTMLDivElement
  let Case: ((values: Record<string, unknown>) => unknown) | undefined
  let stop: (() => void) | undefined
  let frame = 0
  let gone = false
  const show = () => {
    frame = 0
    if (!Case || gone) return
    stop?.()
    host.replaceChildren()
    const v = Object.fromEntries(play.knobs.filter(k => shown(k, values.value)).map(k => [k.prop, values.value[k.prop]]))
    const Shown = Case
    stop = render(() => <Shown {...v} />, host)
    host.toggleAttribute('data-ready', true)
  }
  const sync = () => {
    const url = new URL(location.href)
    const start = startOf(play)
    for (const k of play.knobs) values.value[k.prop] === start[k.prop] ? url.searchParams.delete(k.prop) : url.searchParams.set(k.prop, String(values.value[k.prop]))
    history.replaceState(history.state, '', url)
  }
  const change = (patch: Values) => {
    values.value = { ...values.value, ...patch }
    sync()
    frame ||= requestAnimationFrame(show)
  }
  const set = (prop: string, value: unknown) => change({ [prop]: value })
  onMount(() => {
    const q = new URLSearchParams(location.search)
    const given: Values = {}
    for (const k of play.knobs) {
      const raw = q.get(k.prop)
      if (raw !== null) given[k.prop] = k.control === 'switch' ? raw === 'true' : k.control === 'slider' ? +raw : option(k, raw)
    }
    if (Object.keys(given).length) values.value = { ...values.value, ...given }
    void previews[props.file]!().then(m => { Case = m[play.example] as typeof Case; show() })
  })
  // A button per option, on one row while they fit. A group too wide for the panel lays its options out as an even grid
  // (equal columns that divide them: six as 3×2, four as 2×2; the sliding indicator gives way to a filled pick), never a
  // ragged wrap that ends a row mid-group. When no even grid fits (five long options), the knob shows its dropdown.
  // Measured from the widest option, since the options share one width: fonts arriving late re-measure.
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let knobs!: HTMLDivElement
  const wrap = () => {
    for (const seg of knobs.querySelectorAll<HTMLElement>('[data-part="knob"] > [data-scope="segmented"]')) {
      const knob = seg.parentElement!
      const room = knob.clientWidth
      if (!room) continue // a hidden knob: measured when it shows, since that resizes the panel
      knob.removeAttribute('data-fallback')
      seg.removeAttribute('data-wrap')
      seg.setAttribute('data-measure', '')
      const cell = Math.max(...[...seg.querySelectorAll<HTMLElement>(':scope > label [data-part="item"]')].map(i => i.scrollWidth))
      const n = seg.querySelectorAll(':scope > label').length
      const css = getComputedStyle(seg)
      const gap = parseFloat(css.columnGap) || 0, pad = (parseFloat(css.paddingInlineStart) || 0) + (parseFloat(css.paddingInlineEnd) || 0)
      seg.removeAttribute('data-measure')
      const fits = (cols: number) => cols * cell + (cols - 1) * gap + pad <= room
      if (fits(n)) continue
      let cols = 0
      for (let c = n - 1; c >= 2 && !cols; c--) if (n % c === 0 && fits(c)) cols = c
      if (cols) {
        seg.setAttribute('data-wrap', '')
        seg.style.setProperty('--seg-cols', String(cols))
      } else knob.setAttribute('data-fallback', '')
    }
  }
  let watch: ResizeObserver | undefined
  onMount(() => {
    wrap()
    if (typeof ResizeObserver === 'function') (watch = new ResizeObserver(() => wrap())).observe(knobs)
    void document.fonts?.ready.then(() => { if (!gone) wrap() })
  })
  onCleanup(() => { gone = true; watch?.disconnect(); if (frame) cancelAnimationFrame(frame); stop?.() })
  const code = derived(() => print(play, props.name, values.value))
  const html = derived(() => highlight(code.value, 'tsx'))
  return (
    <div data-site="frame" data-flow={props.flow ?? 'card'} data-play={play.stage === 'fill' ? 'wide' : ''} data-hero="">
      <div data-part="tools">
        <span data-part="play-live"><span data-part="dot" aria-hidden="true"></span>Live preview</span>
        <span data-part="spacer"></span>
        <span data-part="stage-tools">
          <Button emphasis="ghost" tone="neutral" size="sm" icon="palette" label="Expression of this stage" title="Change this stage's expression" data-act="stage-expression" />
          <Button emphasis="ghost" tone="neutral" size="sm" icon="moon" label="Theme of this stage" title="Change this stage's theme" data-act="stage-theme" />
          <Button emphasis="ghost" tone="neutral" size="sm" icon="smartphone" label="Width of this stage" title="Change this stage's width" data-act="stage-width" />
        </span>
      </div>
      <div data-part="pair">
        <div data-part="stage" style={play.height ? `--stage-h:${play.height}px` : undefined}>
          <div data-part="mount" data-stage={play.stage ?? 'center'} ref={host}><span data-part="wait" aria-hidden="true"></span></div>
        </div>
        <div data-part="knobs" role="group" aria-label="Controls" ref={knobs}>
          <div data-part="knobs-head">
            <span data-part="knobs-title">Controls</span>
            <Button size="sm" emphasis="ghost" tone="neutral" icon="rotate-ccw" onClick={() => change(startOf(play))}>Reset</Button>
          </div>
          {play.presets && (
            <div data-part="presets" role="group" aria-label="Presets">
              <span data-part="knob-label">Presets</span>
              <div data-part="preset-list">
                {play.presets.map(p => <Button key={p.label} size="sm" emphasis="soft" tone="neutral" onClick={() => change({ ...startOf(play), ...p.values })}>{p.label}</Button>)}
              </div>
            </div>
          )}
          {play.knobs.map(k => <div key={k.prop} data-part="knob" data-control={k.control} hidden={!shown(k, values.value)}><KnobControl knob={k} values={values} set={set} /></div>)}
        </div>
      </div>
      <div data-part="code">
        <figure data-scope="codeblock" data-live="">
          <div data-part="head">
            <span data-part="lang">Code</span>
            <span data-part="live-note">updates as you change the controls</span>
            <span class="sp"></span>
            <Button emphasis="ghost" tone="neutral" size="sm" icon="copy" label="Copy code" data-act="copy" data-copy="" data-copy-text={code.value} />
          </div>
          <pre tabindex="0"><code
            // oxlint-disable-next-line weft/no-html-sink -- highlight escapes every character of the code it marks up
            innerHTML={html.value}></code></pre>
        </figure>
      </div>
    </div>
  )
}
