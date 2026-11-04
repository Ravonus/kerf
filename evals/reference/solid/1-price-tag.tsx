import { createMemo, createSignal, on, createComputed } from 'solid-js'

type Props = { productId: string; unitPrice: number; taxRate: number; initialQty: number }

export function PriceTag(props: Props) {
  const [qty, setQty] = createSignal('')
  createComputed(
    on(
      () => props.productId,
      () => setQty(String(props.initialQty)),
    ),
  )
  const subtotal = createMemo(() => {
    const n = Number(qty())
    return props.unitPrice * (Number.isFinite(n) ? n : 0)
  })
  const total = () => subtotal() * (1 + props.taxRate)
  return (
    <div>
      <label>
        Quantity{' '}
        <input type="number" value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
      </label>
      <p data-testid="subtotal">Subtotal: ${subtotal().toFixed(2)}</p>
      <p data-testid="total">Total: ${total().toFixed(2)}</p>
    </div>
  )
}
