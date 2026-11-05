import { createHandler, type HandlerOptions, type Manifest } from '../src/server'

export const page = (id: string, file: string) => ({
  id,
  file,
  layouts: [],
  pattern: id,
  params: [],
  kind: 'page' as const,
})
// `hold: 0`: these are of what streams, and their reads land within the default hold.
export const serve = (
  routes: Record<string, () => unknown>,
  options: Partial<HandlerOptions> = {},
) => {
  const manifest: Manifest = {
    dir: 'src/routes',
    layouts: [],
    routes: Object.keys(routes).map((p) => page(p, p)),
  }
  const handler = createHandler({
    manifest,
    modules: Object.fromEntries(Object.entries(routes).map(([p, c]) => [p, { default: c }])),
    hold: 0,
    ...options,
  })
  return (path: string) => handler(new Request(`http://localhost${path}`))
}

export const body = (res: Response) => res.text()
