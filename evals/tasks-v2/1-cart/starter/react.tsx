type Item = { id: string; name: string; price: number }

export function Cart({ items }: { items: Item[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0)
  return (
    <div>
      <ul aria-label="Cart">
        {items.map(item => (
          <li key={item.id}>
            <span data-testid="name">{item.name}</span> <span data-testid="line">${item.price.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p data-testid="total">Total: ${total.toFixed(2)}</p>
    </div>
  )
}
