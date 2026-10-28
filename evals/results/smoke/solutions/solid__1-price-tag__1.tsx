import { createComputed, createSignal, on } from "solid-js";

export function PriceTag(props: {
  productId: string;
  unitPrice: number;
  taxRate: number;
  initialQty: number;
}) {
  const [qty, setQty] = createSignal(String(props.initialQty));

  createComputed(
    on(
      () => props.productId,
      () => setQty(String(props.initialQty)),
      { defer: true },
    ),
  );

  const num = () => {
    const n = Number(qty());
    return qty().trim() === "" || !Number.isFinite(n) ? 0 : n;
  };
  const subtotal = () => props.unitPrice * num();
  const total = () => subtotal() * (1 + props.taxRate);

  return (
    <div>
      <label>
        Quantity
        <input value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
      </label>
      <div data-testid="subtotal">Subtotal: ${subtotal().toFixed(2)}</div>
      <div data-testid="total">Total: ${total().toFixed(2)}</div>
    </div>
  );
}
