import type { Msg } from './state'

export function tabQueue(
  dirtyTab: Set<string>,
  mine: Map<string, number>,
  post: (msg: Msg) => void,
  tab: string,
  GAP_TAB: number,
) {
  let tabLast = 0
  let tabTimer: ReturnType<typeof setTimeout> | undefined
  function flushTab() {
    tabTimer = undefined
    tabLast = performance.now()
    if (dirtyTab.size)
      post({ t: 'bits', tab, e: [...dirtyTab].map((key) => [key, mine.get(key) ?? 0]) })
    dirtyTab.clear()
  }
  function queueTab(key: string) {
    dirtyTab.add(key)
    if (tabTimer !== undefined) return
    const wait = GAP_TAB - (performance.now() - tabLast)
    if (wait <= 0) flushTab()
    else tabTimer = setTimeout(flushTab, wait)
  }

  return queueTab
}
