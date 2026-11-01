// The "cut the wire" button: a real browser's sockets, with a way to fail them. Not part of weft.
const Real = globalThis.WebSocket
const open = new Set<WebSocket>()
let cut = false

class Wire extends Real {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(cut ? 'ws://127.0.0.1:9/' : url, protocols)
    open.add(this)
    this.addEventListener('close', () => open.delete(this))
  }
}

// From the start: a page's one socket can be open before anyone presses Join.
if (typeof window !== 'undefined') globalThis.WebSocket = Wire

export function wire(on: boolean) {
  cut = !on
  if (cut) for (const s of open) s.close()
}
