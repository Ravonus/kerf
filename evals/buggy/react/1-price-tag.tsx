import { useState } from 'react'

type Props = { productId: string; unitPrice: number; taxRate: number; initialQty: number }

export function PriceTag({ productId, unitPrice, taxRate, initialQty }: Props) {
  const [qty, setQty] = useState(String(initialQty))
  const [forProduct, setForProduct] = useState(productId)
  const n = Number(qty)
  const subtotal = unitPrice * (Number.isFinite(n) ? n : 0)
  const total = subtotal * (1 + taxRate)
  return (
    <div>
      <label>
        Quantity <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <p data-testid="subtotal">Subtotal: ${subtotal.toFixed(2)}</p>
      <p data-testid="total">Total: ${total.toFixed(2)}</p>
    </div>
  )
}
