import { state } from 'weft'

const wait = (ms: number) => new Promise(done => setTimeout(done, ms))

export default function Later() {
  const busy = state(false)
  const hits = state(0)
  const go = async () => {
    busy.value = true
    await wait(600)
    hits.value++
    busy.value = false
  }
  return <button disabled={busy.value} onClick={go}>{busy.value ? 'Loading' : `Loaded ${hits.value}`}</button>
}
