import { onMount, state } from 'weft'
import { Button } from '@weft/warp'
import bytes from '../generated/arena.json'

const FRAMES = [
  { id: 'weft', name: 'weft' },
  { id: 'solid', name: 'Solid' },
  { id: 'react', name: 'React' },
] as const

const n = (v: number) => v.toLocaleString('en-US')
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
const ms = (total: number, updates: number) => {
  if (!updates) return '–'
  const each = total / updates
  return each < 0.1 ? '<0.1 ms' : `${each.toFixed(1)} ms`
}
const top = Math.max(...FRAMES.map(f => bytes[f.id]))

/** The same app built three times, each in its own frame. All readouts come from the frames' own harness. */
export function Arena() {
  const rows = FRAMES.map(f => ({ ...f, out: state({ renders: 0, runs: 0, writes: 0, updates: 0, ms: 0 }), frame: undefined as HTMLIFrameElement | undefined }))
  const hot = state(false)
  let box: HTMLElement | undefined
  let beat = 0
  let turn = 0

  const live = () => {
    const order = rows.map((_, i) => rows[(i + turn) % rows.length])
    turn++
    return order.map(r => ({ row: r, arena: (r.frame?.contentWindow as any)?.arena })).filter(r => r.arena)
  }
  const read = () => {
    for (const r of rows) {
      const arena = (r.frame?.contentWindow as any)?.arena
      if (arena) r.out.value = arena.read()
    }
  }
  const stop = () => {
    clearInterval(beat)
    beat = 0
    hot.value = false
    read()
  }
  const start = () => {
    let k = 0
    hot.value = true
    beat = window.setInterval(() => {
      k++
      for (const { arena } of live()) arena.tick(k)
      if (k % 6 === 0) read()
    }, 1000 / 60)
  }

  onMount(() => {
    const heard = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.arena) read() }
    addEventListener('message', heard)
    const seen = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) for (const r of rows) if (!r.frame!.src) r.frame!.src = `/arena/${r.id}/index.html`
      else if (beat) stop()
    })
    seen.observe(box!)
    return () => {
      removeEventListener('message', heard)
      seen.disconnect()
      if (beat) stop()
    }
  })

  return (
    <section data-site="arena" ref={(n: any) => (box = n)}>
      <h2>One click. Three frameworks.</h2>
      <div data-part="actions">
        <Button size="lg" onClick={() => { for (const { arena } of live()) arena.click(); read() }}>Click all three</Button>
        <Button size="lg" emphasis="ghost" tone="neutral" aria-pressed={hot.value ? 'true' : 'false'} onClick={() => (beat ? stop() : start())}>{hot.value ? 'Stop' : '100 cells, 60 times a second'}</Button>
      </div>
      <div data-part="stage">
        {rows.map(r => (
          <article key={r.id}>
            <h3>{r.name}<a href={`/arena/${r.id}/source.txt`}>source</a></h3>
            <iframe ref={(n: any) => (r.frame = n)} title={`${r.name} counter`} scrolling="no"></iframe>
            <div data-part="weight" style={`--share:${bytes[r.id] / top}`}></div>
            <dl>
              <div><dt>JS shipped, br</dt><dd>{kb(bytes[r.id])}</dd></div>
              <div data-loud={r.out.value.renders > 0 ? '' : undefined}><dt>re-renders</dt><dd>{n(r.out.value.renders)}</dd></div>
              <div><dt>reactive runs</dt><dd>{r.id === 'react' ? '–' : n(r.out.value.runs)}</dd></div>
              <div><dt>DOM writes</dt><dd>{n(r.out.value.writes)}</dd></div>
              <div><dt>per update</dt><dd>{ms(r.out.value.ms, r.out.value.updates)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <footer><a href="/arena/shared/harness.txt">the meter</a></footer>
    </section>
  )
}
