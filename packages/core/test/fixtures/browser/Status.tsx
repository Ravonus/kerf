import { interval, media, on, online } from '@kerf-js/core/browser'

/** Server-rendered with declared values: online (default true) and a dark query (`ssr: false`). */
export function Status() {
  const isOnline = online()
  const dark = media('(prefers-color-scheme: dark)', { ssr: false })
  on(window, 'keydown', () => {})
  interval('1s', () => {})
  return (
    <p>
      {isOnline.value ? 'online' : 'offline'} {dark.value ? 'dark' : 'light'}
    </p>
  )
}
