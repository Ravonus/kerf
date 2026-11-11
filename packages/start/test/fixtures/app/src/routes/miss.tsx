import { state } from '@kerf-js/core'

// The row's key differs between server and client, as a random id would.
const side = typeof window === 'undefined' ? 'server' : 'client'

function Box({ children, ...rest }: any) {
  return (
    <label class="box">
      <input type="checkbox" data-kind="spread" {...rest} />
      <span>{children}</span>
    </label>
  )
}

function Later() {
  const text = state('')
  return (
    <input
      class="later"
      value={text.value}
      onInput={(e: any) => (text.value = e.currentTarget.value)}
    />
  )
}

export default function Miss() {
  const on = state(false)
  const text = state('')
  const tick = state(false)
  return (
    <main class="miss">
      <button type="button" class="plain" title={on.value ? 'on' : 'off'}>
        before
      </button>
      <ul>
        {[side].map((k) => (
          <li key={k} class={on.value ? 'row on' : 'row off'} title={on.value ? 'on' : 'off'}>
            <Box checked={on.value} onChange={(e: any) => (on.value = e.currentTarget.checked)}>
              tick
            </Box>
          </li>
        ))}
      </ul>
      <button type="button" class="after" title={on.value ? 'on' : 'off'}>
        after
      </button>
      <input
        class="typed"
        value={text.value}
        onInput={(e: any) => (text.value = e.currentTarget.value)}
      />
      <input
        class="ticked"
        type="checkbox"
        checked={tick.value}
        onChange={(e: any) => (tick.value = e.currentTarget.checked)}
      />
      <p class="echo">
        {text.value}|{String(tick.value)}
      </p>
      <Later />
    </main>
  )
}
