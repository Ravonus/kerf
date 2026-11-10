import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

function Page() {
  const on = state(false)
  return (
    <main style="padding:8px">
      <p class="lead" style={{ color: 'red', fontSize: 12 }}>
        fixed
      </p>
      <p class={on.value ? 'on' : 'off'} style="margin:0">
        dynamic class
      </p>
      <p style={{ opacity: on.value ? 1 : 0.5 }}>dynamic style</p>
    </main>
  )
}

render(() => <Page />, document.body)
