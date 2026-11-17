import type { ErrorRouteProps } from '@kerf-js/start'

export const meta = { title: 'Something broke' }

export default function Failed(props: ErrorRouteProps) {
  return (
    <main>
      <h1 class="error">
        Error {props.data.status}: {props.data.message}
      </h1>
      <p id="error-reference">{props.data.reference}</p>
      <button
        id="retry-route"
        type="button"
        disabled={props.pending}
        onClick={() => void props.retry()}
      >
        {props.pending ? 'Recovering' : 'Retry'}
      </button>
    </main>
  )
}
