// Locals that name a prop, in the forms a component body writes them.
export function Price(props: {
  amount: number
  label?: string | undefined
  user: { name: string }
  items: { id: number; t: string }[]
  title?: string
}) {
  const amount = props.amount
  const { label = 'Total', user: person, ...rest } = props
  const name = person.name
  const items = props.items
  const n = items.length
  return (
    <section title={rest.title}>
      <p>
        {label}: {amount}
      </p>
      <b>{name}</b>
      <i>{n}</i>
      <ul>
        {items.map((x) => (
          <li key={x.id}>{x.t}</li>
        ))}
      </ul>
    </section>
  )
}
