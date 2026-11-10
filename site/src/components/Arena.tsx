import { onMount, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'
import bytes from '../generated/arena.json'
import built from '../generated/arena-built.json'
import speed from '../generated/speed.json'

/** What each frame's harness puts on its window. */
type Harness = {
  read: () => { renders: number; runs: number; writes: number; updates: number; ms: number }
  tick: (k: number) => void
  click: () => void
}
const harness = (r: { frame: HTMLIFrameElement | undefined }) =>
  (r.frame?.contentWindow as { arena?: Harness } | null | undefined)?.arena

const FRAMES = [
  { id: 'weft', name: 'weft' },
  { id: 'solid', name: 'Solid' },
  { id: 'react', name: 'React' },
] as const
const ARENA_BUILD = '../benchmarks/arena/build.mjs'

// Thousands by hand: the first `toLocaleString` on a page sets up Intl, which costs more than this whole island.
const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, ',')
const kb = (size: number) => `${(size / 1024).toFixed(1)} KB`
/** Needs a real run: a few presses are too few to compare, so the row stays empty until the 60 a second has run for a while. */
const ENOUGH = 300
const ms = (total: number, updates: number) =>
  updates < ENOUGH ? '–' : `${(total / updates).toFixed(2)} ms`
const time = (v: number) => (v < 0.01 ? '<0.01' : v < 10 ? v.toFixed(2) : v.toFixed(1))
const us = (v: number) => `${Math.round(v)} µs`
const top = Math.max(...FRAMES.map((f) => bytes[f.id]))

/* @weft visible */
/** The same app built three times, each in its own frame. All readouts come from the frames' own harness. */
export function Arena() {
  const model = arenaState()
  return (
    <section data-site="arena" ref={model.setBox}>
      <h2>The same app in Weft, Solid and React</h2>
      {!built.frames && (
        <p data-part="missing" role="status">
          The live comparison isn't in this build: its three frames come from{' '}
          <code>{ARENA_BUILD}</code>, which hasn't been run. The measured table below doesn't need
          them.
        </p>
      )}
      {built.frames && (
        <>
          {arenaContent(model)}
          <p data-part="note">
            All three make the same page changes, because they show the same thing. The difference
            is the work behind it: React re-runs components to find those changes, and ships more
            code to do so. <a href="/arena/shared/harness.txt">How this is measured</a>: each update
            at 60 a second is timed on its own, with nothing watching the page, and the times are
            added up. One update in 30 runs untimed so its page changes can be counted. Time per
            update stays empty until a run has about five seconds in it, because a few clicks are
            too few to compare. On an {speed.machine}, 60 updates a second take{' '}
            {us(speed.arena.weft)} each in weft, {us(speed.arena.solid)} in Solid,{' '}
            {us(speed.arena.react)} in React and {us(speed.arena.raw)} in hand-written DOM.
          </p>
        </>
      )}
      <h3>Speed, measured in Chromium</h3>
      <p data-part="intro">
        weft is faster than Solid in {speed.wins} of these {speed.rows.length} rows and slower in{' '}
        {speed.losses}, marked in red. In the rest the rounds overlap. Times are milliseconds, the
        median of three rounds on an {speed.machine} on {speed.when}, with Solid {speed.solid}.
      </p>
      <div data-part="table" tabindex="0" role="region" aria-label="Speed, measured in Chromium">
        <table>
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Weft</th>
              <th scope="col">Solid</th>
              <th scope="col">React</th>
              <th scope="col">Fastest</th>
            </tr>
          </thead>
          <tbody>
            {speed.rows.map((r) => (
              <tr key={r.label} data-lost={r.fastest === 'Solid' ? '' : undefined}>
                <th scope="row">{r.label}</th>
                <td>{time(r.weft)}</td>
                <td>{time(r.solid)}</td>
                <td>{time(r.react)}</td>
                <td>{r.fastest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function arenaState() {
  const rows = FRAMES.map((f) => ({
    ...f,
    out: state({ renders: 0, runs: 0, writes: 0, updates: 0, ms: 0 }),
    frame: undefined as HTMLIFrameElement | undefined,
  }))
  const hot = state(false)
  let box: HTMLElement | undefined
  let beat = 0
  let turn = 0

  const live = () => {
    const order = rows.map((_, i) => rows[(i + turn) % rows.length]!)
    turn++
    return order.map(harness).filter((arena) => arena !== undefined)
  }
  const read = () => {
    for (const r of rows) {
      const arena = harness(r)
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
      for (const arena of live()) arena.tick(k)
      if (k % 6 === 0) read()
    }, 1000 / 60)
  }

  onMount(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.arena) read()
    }
    addEventListener('message', heard)
    const seen = new IntersectionObserver(([e]) => {
      if (e!.isIntersecting)
        for (const r of rows)
          if (r.frame && !r.frame.src) r.frame.src = `/arena/${r.id}/index.html`
          else if (beat) stop()
    })
    seen.observe(box!)
    return () => {
      removeEventListener('message', heard)
      seen.disconnect()
      if (beat) stop()
    }
  })

  return {
    rows,
    hot,
    live,
    read,
    stop,
    start,
    running: () => beat,
    setBox: (el: HTMLElement) => (box = el),
  }
}

function arenaContent(model: ReturnType<typeof arenaState>) {
  const { rows, hot, live, read, stop, start, running } = model
  return (
    <>
      <p data-part="intro">
        These are three real production builds of one small app, running in your browser now: a
        counter and a grid of 1,000 cells. Press the buttons and compare what each one had to do.
      </p>
      <div data-part="actions">
        <Button
          size="lg"
          onClick={() => {
            for (const arena of live()) arena.click()
            read()
          }}
        >
          Click all three
        </Button>
        <Button
          size="lg"
          emphasis="ghost"
          tone="neutral"
          aria-pressed={hot.value ? 'true' : 'false'}
          onClick={() => (running() ? stop() : start())}
        >
          {hot.value ? 'Stop' : 'Run 60 updates a second'}
        </Button>
      </div>
      <div data-part="stage">
        {rows.map((r) => (
          <article key={r.id}>
            <h3>
              {r.name}
              <a href={`/arena/${r.id}/source.txt`}>source</a>
            </h3>
            <iframe
              ref={(el) => (r.frame = el)}
              title={`${r.name} counter`}
              scrolling="no"
            ></iframe>
            <div data-part="weight" style={`--share:${bytes[r.id] / top}`}></div>
            <dl>
              <div>
                <dt>download size</dt>
                <dd>{kb(bytes[r.id])}</dd>
              </div>
              <div data-loud={r.out.value.renders > 0 ? '' : undefined}>
                <dt>components re-run</dt>
                <dd>{n(r.out.value.renders)}</dd>
              </div>
              <div>
                <dt>small updates run</dt>
                <dd>{r.id === 'react' ? '–' : n(r.out.value.runs)}</dd>
              </div>
              <div>
                <dt>page changes</dt>
                <dd>{n(r.out.value.writes)}</dd>
              </div>
              <div>
                <dt>time per update</dt>
                <dd>{ms(r.out.value.ms, r.out.value.updates)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  )
}
