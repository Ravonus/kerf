// An imported ref callback (compiler-items.test.tsx): `ref={seenRef}` must call it, not assign the import.
export const seen: Element[] = []
export function seenRef(el: Element) {
  seen.push(el)
}
