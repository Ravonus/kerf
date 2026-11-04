'use client'

export function StockToggle({ on }: { on: boolean }) {
  return (
    <input
      type="checkbox"
      name="stock"
      value="1"
      defaultChecked={on}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="size-4 accent-[var(--accent)]"
    />
  )
}
