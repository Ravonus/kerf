import { render } from '@kerf-js/core/dom'
import type { ShellBootstrap } from '../shell/bootstrap'
import { ShellDataError } from '../shell/operation'

/** A first-read error stays in the release's startup view until a local retry succeeds. */
export async function beforeShell(
  bootstrap: ShellBootstrap,
  container: Element,
  mount: () => void,
) {
  document.getElementById('kerf-shell-pending')?.remove()
  const { pending: Pending, failure: Failure } = bootstrap.views
  let dispose: (() => void) | undefined
  let reading = false
  const read = async () => {
    if (reading) return
    reading = true
    dispose?.()
    dispose = render(
      () => (Pending ? <Pending /> : <p role="status">Loading application settings…</p>),
      container,
    )
    try {
      await bootstrap.refresh()
    } catch (cause) {
      const error = cause instanceof ShellDataError ? cause : new ShellDataError('invalid')
      const retry = () => void read()
      dispose()
      dispose = render(
        () =>
          Failure ? (
            <Failure error={error} retry={retry} />
          ) : (
            <div role="alert">
              <p>{error.message}</p>
              <button type="button" onClick={retry}>
                Retry
              </button>
            </div>
          ),
        container,
      )
      return
    } finally {
      reading = false
    }
    dispose()
    mount()
  }
  await read()
}
