import type { state } from '@weft-js/core'

type Text = ReturnType<typeof state<string>>
type Errors = ReturnType<typeof state<string[]>>
type Cart = ReturnType<typeof state<Record<string, number>>>

export function makeOrder(
  name: Text,
  email: Text,
  card: Text,
  errors: Errors,
  thanks: Text,
  cart: Cart,
) {
  return (event: Event) => {
    event.preventDefault()
    const bad = [
      !name.value.trim(),
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value),
      !/^\d{16}$/.test(card.value.replaceAll(' ', '')),
    ]
    errors.value = bad.map((invalid, i) =>
      invalid ? (['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i] ?? '') : '',
    )
    const first = bad.indexOf(true)
    if (first >= 0)
      queueMicrotask(() => document.getElementById(['name', 'email', 'card'][first] ?? '')?.focus())
    else {
      thanks.value = name.value.trim()
      cart.value = {}
    }
  }
}
