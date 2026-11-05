import { onMount, state, watch } from '@weft-js/core'
import { subscribePrices } from '../live-prices'
import type { Product } from './shop-state'

export function shopLive(products: Product[]) {
  const prices = state<Record<string, number>>({})
  const flash = state<Record<string, boolean>>({})
  const addedPrices = state<Record<string, number>>({})
  const favourites = state<string[]>([])
  const favouritesOnly = state(false)
  const ready = state(false)
  const priceOf = (p: Product) => prices.value[p.name] ?? p.price
  onMount(() => {
    try {
      favourites.value = JSON.parse(localStorage.getItem('shop-favourites') ?? '[]')
    } catch {
      favourites.value = []
    }
    ready.value = true
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const unsubscribe = subscribePrices(({ id, price }) => {
      const product = products.find((p) => p.name.toLowerCase() === id)
      if (!product || price === priceOf(product)) return
      prices.value = { ...prices.value, [product.name]: price }
      flash.value = { ...flash.value, [product.name]: true }
      clearTimeout(timers.get(product.name))
      timers.set(
        product.name,
        setTimeout(() => {
          flash.value = { ...flash.value, [product.name]: false }
        }, 1000),
      )
    })
    return () => {
      unsubscribe()
      for (const timer of timers.values()) clearTimeout(timer)
    }
  })
  watch(
    () => [favourites.value, ready.value] as const,
    ([items, loaded]) => {
      if (loaded) localStorage.setItem('shop-favourites', JSON.stringify(items))
    },
  )
  const toggleFavourite = (itemName: string) => {
    favourites.value = favourites.value.includes(itemName)
      ? favourites.value.filter((item) => item !== itemName)
      : [...favourites.value, itemName]
  }
  return { prices, flash, addedPrices, favourites, favouritesOnly, priceOf, toggleFavourite }
}
