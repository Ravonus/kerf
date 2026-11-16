import { state } from '@kerf-js/core'
import type { RouteProps } from '@kerf-js/start'

/** A layout below the root that runs in the browser, with its page after its own content in one element. */
export default function Explorer(props: RouteProps) {
  const opened = state(0)
  return (
    <div class="explorer">
      <button class="chrome" onClick={() => void opened.value++}>
        Explorer {opened.value}
      </button>
      {props.children}
    </div>
  )
}
