import { derived, state, watch } from '@kerf-js/core'
import type { State } from '@kerf-js/core'
import type { Api, Holding, Stock } from './api'
import type { Live, Tab, View } from './App'

type Saved = { tab: Tab; views: Record<Tab, View> }
type Save = { id: string; prev: string }

function watchFeed(
  getApi: () => Api,
  stocks: State<Stock[] | null>,
  holdings: State<Holding[]>,
  live: State<Record<string, Live>>,
  favorites: State<Record<string, boolean>>,
) {
  watch(getApi, (source) => {
    let alive = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, held]) => {
      if (!alive) return
      live.value = Object.fromEntries(
        list.map((s) => [s.id, { price: s.price, history: [s.price] }]),
      )
      favorites.value = Object.fromEntries(list.map((s) => [s.id, s.favorite]))
      holdings.value = held
      stocks.value = list
    })
    const unsubscribe = source.subscribeQuotes(({ id, price }) => {
      const now = live.value[id]
      if (now)
        live.value = {
          ...live.value,
          [id]: { price, history: [...now.history, price].slice(-20) },
        }
    })
    return () => {
      alive = false
      unsubscribe()
    }
  })
}

function setupView(tab: State<Tab>, views: State<Record<Tab, View>>, VIEW_KEY: string) {
  watch(
    () => ({ tab: tab.value, views: views.value }),
    (v) => localStorage.setItem(VIEW_KEY, JSON.stringify(v)),
  )

  const view = derived(() => views.value[tab.value])
  const setView = (patch: Partial<View>) =>
    (views.value = { ...views.value, [tab.value]: { ...view.value, ...patch } })
  const favoritesOnly = derived(() => view.value.favoritesOnly)
  const sortBy = derived(() => view.value.sort)

  return { view, setView, favoritesOnly, sortBy }
}

function setupSearch(
  getApi: () => Api,
  tab: State<Tab>,
  views: State<Record<Tab, View>>,
  saved: Saved,
  TABS: Tab[],
) {
  // One search per tab, started the first time the tab is shown and kept from then on: switching away neither
  // aborts nor hides its request. Each reads only its own tab's entries, so typing in one tab leaves the others be.
  const visited = state<Partial<Record<Tab, true>>>({ [saved.tab]: true })
  const searchFor = (t: Tab) => {
    const term = derived(() => views.get(t).query.trim())
    const results = state<Set<string> | null>(null)
    const pending = state(false)
    const error = state<unknown>(undefined)
    watch(
      () => (visited.get(t) ? term.value : ''),
      (q) => {
        error.value = undefined
        if (!q) {
          results.value = null
          pending.value = false
          return
        }
        pending.value = true
        getApi()
          .search(q, new AbortController().signal)
          .then(
            (ids) => {
              results.value = new Set(ids)
              pending.value = false
            },
            (e) => {
              error.value = e
              pending.value = false
            },
          )
      },
    )
    return {
      get value() {
        return results.value
      },
      get pending() {
        return pending.value
      },
      get error() {
        return error.value
      },
    }
  }
  const searches = Object.fromEntries(TABS.map((t) => [t, searchFor(t)])) as Record<
    Tab,
    ReturnType<typeof searchFor>
  >
  const search = derived(() => searches[tab.value])
  const selectTab = (t: Tab) => {
    if (!visited.value[t]) visited.value = { ...visited.value, [t]: true }
    tab.value = t
  }

  return { search, selectTab }
}

function setupSelection(
  stocks: State<Stock[] | null>,
  holdings: State<Holding[]>,
  live: State<Record<string, Live>>,
  favorites: State<Record<string, boolean>>,
  tab: State<Tab>,
  search: ReturnType<typeof setupSearch>['search'],
  favoritesOnly: ReturnType<typeof setupView>['favoritesOnly'],
  sortBy: ReturnType<typeof setupView>['sortBy'],
) {
  // Rows keep their identity (the loaded Stock objects), so the list only adds, removes and moves rows.
  const filtered = derived(() => {
    const t = tab.value
    const ids = search.value.value
    return (stocks.value ?? []).filter(
      (s) =>
        (t === 'All' || s.sector === t) &&
        (!ids || ids.has(s.id)) &&
        (!favoritesOnly.value || favorites.value[s.id]),
    )
  })
  // Only the Change sort reads prices, so quotes don't re-sort a Symbol list. Array#sort is stable: ties keep list order.
  const shown = derived(() => {
    const rows = filtered.value
    if (sortBy.value !== 'change') return rows
    const change = new Map(
      rows.map((s) => [s, (live.value[s.id].price - s.prevClose) / s.prevClose]),
    )
    return [...rows].sort((a, b) => change.get(b)! - change.get(a)!)
  })
  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (live.get(h.id)?.price ?? 0), 0),
  )

  return { shown, portfolio }
}

function setupActions(
  getApi: () => Api,
  stocks: State<Stock[] | null>,
  favorites: State<Record<string, boolean>>,
  alert: State<string | null>,
  openId: State<string | null>,
  notes: State<Record<string, string>>,
  saves: State<Save[]>,
) {
  // Clicks per star, so a failed save only reverts its star if nothing clicked it since.
  const clicks: Record<string, number> = {}
  const toggle = (stock: Stock) => {
    const before = !!favorites.value[stock.id]
    const click = (clicks[stock.id] = (clicks[stock.id] ?? 0) + 1)
    favorites.value = { ...favorites.value, [stock.id]: !before }
    getApi()
      .setFavorite(stock.id, !before)
      .catch(() => {
        if (clicks[stock.id] === click) favorites.value = { ...favorites.value, [stock.id]: before }
        alert.value = `Couldn't update ${stock.symbol}`
      })
  }

  const opener: { button?: HTMLElement } = {}
  const openDetails = (id: string, button: HTMLElement) => {
    opener.button = button
    openId.value = id
  }
  const closeDetails = () => {
    opener.button?.focus()
    openId.value = null
  }
  // A keyed list of at most one: opening another stock mounts a fresh panel (its own load, draft and focus).
  const opened = derived(() => (stocks.value ?? []).filter((s) => s.id === openId.value))

  const save = (id: string, text: string) => {
    saves.value = [...saves.value, { id, prev: notes.value[id] ?? '' }]
    notes.value = { ...notes.value, [id]: text }
  }
  const undo = () => {
    const last = saves.value.at(-1)
    if (!last) return
    saves.value = saves.value.slice(0, -1)
    notes.value = { ...notes.value, [last.id]: last.prev }
  }

  return { toggle, openDetails, closeDetails, opened, save, undo }
}

export function appModel(getApi: () => Api, loadSaved: () => Saved, TABS: Tab[], VIEW_KEY: string) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<Record<string, Live>>({})
  const favorites = state<Record<string, boolean>>({})
  const saved = loadSaved()
  const tab = state<Tab>(saved.tab)
  const views = state<Record<Tab, View>>(saved.views)
  const alert = state<string | null>(null)
  const openId = state<string | null>(null)
  const notes = state<Record<string, string>>({})
  const saves = state<Save[]>([])

  watchFeed(getApi, stocks, holdings, live, favorites)
  const { view, setView, favoritesOnly, sortBy } = setupView(tab, views, VIEW_KEY)
  const { search, selectTab } = setupSearch(getApi, tab, views, saved, TABS)
  const { shown, portfolio } = setupSelection(
    stocks,
    holdings,
    live,
    favorites,
    tab,
    search,
    favoritesOnly,
    sortBy,
  )
  const { toggle, openDetails, closeDetails, opened, save, undo } = setupActions(
    getApi,
    stocks,
    favorites,
    alert,
    openId,
    notes,
    saves,
  )
  return {
    stocks,
    live,
    favorites,
    tab,
    alert,
    notes,
    saves,
    view,
    setView,
    search,
    selectTab,
    shown,
    portfolio,
    toggle,
    openDetails,
    closeDetails,
    opened,
    save,
    undo,
  }
}
