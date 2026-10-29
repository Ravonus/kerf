import { createSignal, type Accessor } from 'solid-js'

/**
 * The favorite star of one stock. A click sets it at once and returns a token; a failed save puts it back
 * only if no later click came in since.
 */
export type LiveFavorite = {
  favorite: Accessor<boolean>
  click(next: boolean): number
  revert(token: number, previous: boolean): boolean
}

export function createLiveFavorite(initial: boolean): LiveFavorite {
  const [favorite, setValue] = createSignal(initial)
  let clicks = 0
  return {
    favorite,
    click(next) {
      setValue(() => next)
      return ++clicks
    },
    revert(token, previous) {
      if (token !== clicks) return false
      setValue(() => previous)
      return true
    },
  }
}

export function createLiveFavorites(stocks: { id: string; favorite: boolean }[]): Map<string, LiveFavorite> {
  return new Map(stocks.map(s => [s.id, createLiveFavorite(s.favorite)]))
}
