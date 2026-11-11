import './styles'

/** One key (05 §6): `<Kbd>⌘</Kbd><Kbd>K</Kbd>`. */
export function Kbd({ children }: { children: unknown }) {
  return <kbd data-scope="kbd">{children}</kbd>
}
