import { derived, state } from 'weft'

export default function Total() {
  const price = state(4)
  const qty = state(2)
  const total = derived(() => price.value * qty.value)
  return (
    <>
      <button onClick={() => price.value++}>price {price.value}</button>
      <button onClick={() => qty.value++}>qty {qty.value}</button>
      <output>{total.value}</output>
    </>
  )
}
