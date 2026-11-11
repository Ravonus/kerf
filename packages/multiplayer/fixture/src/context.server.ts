// Who's signed in, from a cookie the browser test sets: a stand-in for the app's own session.
export default ({ request }: { request: Request }) => {
  const who = /(?:^|;\s*)who=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
  return { who: who ?? 'guest' }
}

declare module '@kerf/start' {
  interface Context {
    who: string
  }
}
