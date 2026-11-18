import type { ErrorRouteProps } from '@kerf-js/start'

export const meta = { title: 'Release error' }

export default function Failure(props: ErrorRouteProps) {
  return (
    <main>
      <h1>Release error</h1>
      <p>{props.data.message}</p>
      <p data-reference={props.data.reference}></p>
      <button type="button" onClick={() => void props.retry()} disabled={props.pending}>
        Try again
      </button>
    </main>
  )
}
