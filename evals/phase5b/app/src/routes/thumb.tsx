// The client side of the exit check. It is never edited: the swap from a TS `run` to `native()` leaves this file, and
// every byte built from it, as they were.
import { Boundary, state } from '@weft-js/core'
import { guarded, thumbnail } from '../server/thumb'

function Result(props: { seed: number }) {
  const done = thumbnail(() => ({ seed: props.seed, width: 320, height: 240 }))
  return <output class="sum">{done.value?.checksum}</output>
}

export default function Thumb() {
  const seed = state(7)
  const failed = state('')
  const open = () =>
    guarded
      .fetch({ width: 100_000, height: 100_000 })
      .catch((e: { code?: string; data?: { pixels: number } }) => {
        failed.value = `${e.code}:${e.data?.pixels}`
      })
  return (
    <main>
      <h1>Thumb</h1>
      <button onClick={() => seed.value++}>Next</button>
      <button onClick={open}>Open</button>
      <Boundary fallback={<p>…</p>}>
        <Result seed={seed.value} />
      </Boundary>
      <p class="failed">{failed.value}</p>
    </main>
  )
}
