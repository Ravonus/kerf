import { memo, useCallback, useSyncExternalStore } from 'react'
import type { Api } from '../api'
import type { QuoteStore } from '../quotes'

/** Its own component so a star change re-renders only this button, not the row. */
export const FavoriteButton = memo(function FavoriteButton({
  id, symbol, store, api, onSaveError,
}: {
  id: string
  symbol: string
  store: QuoteStore
  api: Api
  onSaveError: (message: string | null) => void
}) {
  const get = useCallback(() => store.isFavorite(id), [store, id])
  const favorite = useSyncExternalStore(store.subscribeFavorites, get)

  const onClick = () => {
    const before = store.isFavorite(id)
    const token = store.setFavoriteOptimistic(id, !before)
    api.setFavorite(id, !before).then(
      () => onSaveError(null),
      () => {
        store.revertFavorite(id, token, before)
        onSaveError(`Couldn't update ${symbol}`)
      },
    )
  }

  return (
    <button type="button" aria-label={`Favorite ${symbol}`} aria-pressed={favorite} onClick={onClick}>
      {favorite ? '★' : '☆'}
    </button>
  )
})
