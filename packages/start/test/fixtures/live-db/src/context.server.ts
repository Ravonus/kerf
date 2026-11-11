// Who's asking, from a cookie: all an access rule needs here. A real app uses `auth`.
export default ({ request }: { request: Request }) => ({
  user: /(?:^|; )user=(\w+)/.exec(request.headers.get('cookie') ?? '')?.[1]
    ? { id: /(?:^|; )user=(\w+)/.exec(request.headers.get('cookie')!)![1] }
    : null,
})

declare module '@kerf-js/start' {
  interface Context {
    user: { id: string } | null
  }
}
