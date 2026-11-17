// The 404 and error pages an app gets until it adds `src/routes/404.tsx` or `src/routes/_error.tsx`.
import type { ErrorRouteProps } from './failure'

export function NotFoundPage(props: { data: { path?: string } }) {
  return (
    <main>
      <h1>Not found</h1>
      <p>Nothing lives at {props.data?.path}.</p>
    </main>
  )
}

/** The recoverable fallback when the app has no error page or that page fails. */
export function ErrorPage(props: ErrorRouteProps) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{props.data?.message}</p>
      <p>Reference: {props.data?.reference}</p>
      <button type="button" onClick={() => void props.retry()} disabled={props.pending}>
        {props.pending ? 'Recovering…' : 'Retry'}
      </button>
      <a rel="external" href="">
        Reload page
      </a>
    </main>
  )
}
