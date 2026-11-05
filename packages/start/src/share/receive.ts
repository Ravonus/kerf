import {
  clients,
  siblings,
  tabAt,
  tabs,
  visible,
  type Client,
  type Msg,
  type Triple,
} from './state'
import { hear, render, renderAll } from './display'

export function receiver(
  dropClients: (test: (e: Client, id: string) => boolean) => void,
  watch: (tab: string) => void,
  reconcile: () => void,
  wakeIfLeading: () => void,
  leading: () => boolean,
  post: (msg: Msg) => void,
  announce: () => void,
  dropTab: (tab: string) => void,
  link: (up: boolean) => void,
) {
  return (m: Msg) => {
    if (m.t === 'tab') {
      tabs.set(m.tab, new Map(m.keys))
      tabAt.set(m.tab, Date.now())
      visible.set(m.tab, m.shown)
      if (m.k && !siblings.has(m.k)) {
        siblings.add(m.k)
        dropClients((_, id) => id === m.k)
      }
      watch(m.tab)
      renderAll()
      reconcile()
      if (m.shown) wakeIfLeading()
      // A tab that arrived late has what the socket already heard.
      if (leading()) {
        const s: Triple[] = []
        for (const [key] of m.keys)
          for (const [id, e] of clients.get(key) ?? []) s.push([id, key, e.bits])
        if (s.length) post({ t: 'net', s })
      }
    } else if (m.t === 'bits') {
      const keys = tabs.get(m.tab) ?? new Map<string, number>()
      tabs.set(m.tab, keys)
      tabAt.set(m.tab, Date.now())
      for (const [key, bits] of m.e) keys.set(key, bits)
      watch(m.tab)
      for (const [key] of m.e) render(key)
      reconcile()
    } else if (m.t === 'shown') {
      visible.set(m.tab, m.shown)
      if (m.shown) wakeIfLeading()
    } else if (m.t === 'roll') announce()
    else if (m.t === 'bye') dropTab(m.tab)
    else if (m.t === 'net') hear(m.s, leading())
    else if (m.t === 'link') link(m.up)
  }
}
