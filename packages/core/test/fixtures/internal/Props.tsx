export function InternalProps({ amount, children, ...rest }: {
  amount: number
  children?: unknown
  title?: string
}) {
  return <button {...rest} onClick={() => amount++}>{amount}{children}</button>
}
