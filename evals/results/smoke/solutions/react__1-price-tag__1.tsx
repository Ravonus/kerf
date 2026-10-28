import { useState } from "react";

export function PriceTag({
  productId,
  unitPrice,
  taxRate,
  initialQty,
}: {
  productId: string;
  unitPrice: number;
  taxRate: number;
  initialQty: number;
}) {
  const [qtyText, setQtyText] = useState(String(initialQty));
  const [prevProductId, setPrevProductId] = useState(productId);

  let text = qtyText;
  if (prevProductId !== productId) {
    setPrevProductId(productId);
    text = String(initialQty);
    setQtyText(text);
  }

  const parsed = text.trim() === "" ? 0 : Number(text);
  const qty = Number.isFinite(parsed) ? parsed : 0;
  const subtotal = unitPrice * qty;
  const total = subtotal * (1 + taxRate);

  return (
    <div>
      <label>
        Quantity
        <input value={text} onChange={(e) => setQtyText(e.target.value)} />
      </label>
      <div data-testid="subtotal">Subtotal: ${subtotal.toFixed(2)}</div>
      <div data-testid="total">Total: ${total.toFixed(2)}</div>
    </div>
  );
}
