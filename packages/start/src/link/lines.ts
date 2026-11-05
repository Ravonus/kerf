export interface Mine {
  id: string
  hello: string
  frame(text: string): void
  closed(code: number, reason?: string): void
}

export const lines = new Map<string, Mine>()

export function end(l: Mine, code: number, reason?: string) {
  lines.delete(l.id)
  l.closed(code, reason)
}
export const endAll = (code: number) => {
  for (const l of Array.from(lines.values())) end(l, code)
}

export function arrive(text: string) {
  const at = text.indexOf(':', 2)
  const l = lines.get(text.slice(2, at))
  if (!l) return
  if (text[0] === 'x') {
    const split = text.indexOf(':', at + 1)
    return end(l, +text.slice(at + 1, split), text.slice(split + 1))
  }
  l.frame(text.slice(at + 1))
}
