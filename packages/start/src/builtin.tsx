// The 404 and error pages an app gets until it adds `src/routes/404.tsx` or `src/routes/_error.tsx`.

export function NotFoundPage(props: { data: { path?: string } }) {
  return (
    <main>
      <h1>Not found</h1>
      <p>Nothing lives at {props.data?.path}.</p>
    </main>
  )
}

export function ErrorPage(props: { data: { status: number; message: string } }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{props.data?.message}</p>
    </main>
  )
}
