// A small protocol client for /_weft/rt: tests and the runtime matrix use it. Frames are parsed the way live.ts does.
import { createHash } from 'node:crypto'

const headers = { 'content-type': 'application/json', 'x-weft': '1' }

/** Ids are `<export>.<hash of the file>`, and the fixture's and the matrix app's module is `src/server/feed.ts`. */
export const frameId = (_url, name, file = 'src/server/feed.ts') => `${name}.${createHash('sha256').update(file).digest('hex').slice(0, 6)}`

export const rpc = async (url, id, input) => {
  const res = await fetch(`${url}/_weft/fn/${id}`, { method: 'POST', headers, body: JSON.stringify({ i: input }) })
  if (!res.ok) throw new Error(`${id}: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function pageCursor(url, path) {
  const html = await fetch(url + path).then(r => r.text())
  const m = /<script type="application\/json" id="weft-rt">(.*?)<\/script>/.exec(html)
  return m ? JSON.parse(m[1]).c : undefined
}

export async function connect(url, body) {
  const ac = new AbortController()
  const res = await fetch(`${url}/_weft/rt`, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
  if (!res.ok) throw new Error(`/_weft/rt: ${res.status} ${await res.text()}`)
  const frames = []
  const waiting = new Set()
  void (async () => {
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true })
        for (let i; (i = buf.indexOf('\n\n')) >= 0; buf = buf.slice(i + 2)) {
          if (buf[0] === ':') continue
          const line = buf.indexOf('\n')
          frames.push([buf.slice(7, line), JSON.parse(buf.slice(line + 7, i))])
          for (const w of waiting) w()
        }
      }
    } catch {}
  })()
  return {
    frames,
    /** The next unread frame of this type. */
    async until(event, timeout = 5000) {
      const end = Date.now() + timeout
      for (;;) {
        const i = frames.findIndex(f => f[0] === event)
        if (i >= 0) return frames.splice(i, 1)[0][1]
        const left = end - Date.now()
        if (left <= 0) throw new Error(`no \`${event}\` frame in ${timeout} ms: ${JSON.stringify(frames)}`)
        await new Promise(ok => {
          const t = setTimeout(ok, left)
          const w = () => { clearTimeout(t); waiting.delete(w); ok() }
          waiting.add(w)
        })
      }
    },
    close: () => ac.abort(),
  }
}
