import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'

type Props = { search: (q: string, signal: AbortSignal) => Promise<string[]>; onPick: (city: string) => void }

export function CityPicker(props: Props) {
  const [text, setText] = createSignal('')
  const [query, setQuery] = createSignal('')
  const [options, setOptions] = createSignal<string[] | null>(null)
  const [active, setActive] = createSignal(-1)

  createEffect(() => {
    const q = text().trim()
    if (!q) { setOptions(null); return }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      props.search(q, ctrl.signal).then(r => { if (!ctrl.signal.aborted) { setOptions(r); setActive(-1) } }, () => {})
    }, 250)
    onCleanup(() => { clearTimeout(timer); ctrl.abort() })
  })

  const onKeyDown = (e: KeyboardEvent) => {
    const opts = options()
    if (!opts) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, opts.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') setOptions(null)
    else if (e.key === 'Enter' && active() >= 0) {
      e.preventDefault()
      const city = opts[active()]
      setText(city)
      setOptions(null)
      props.onPick(city)
    }
  }
  return (
    <div>
      <label>City <input value={text()} onKeyDown={onKeyDown} onInput={e => { setText(e.currentTarget.value); setQuery(e.currentTarget.value) }} /></label>
      <Show when={options()}>
        {opts => <ul role="listbox"><For each={opts()}>{(o, i) => <li role="option" aria-selected={i() === active()}>{o}</li>}</For></ul>}
      </Show>
    </div>
  )
}
