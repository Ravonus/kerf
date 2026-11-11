import { onCleanup, state } from '@kerf-js/core'
import type { Token } from '../surface'

// ---- tokens --------------------------------------------------------------------------------------------------------

const scratch = (() => {
  let ctx: CanvasRenderingContext2D | null | undefined
  return () =>
    (ctx ??= (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      return c.getContext('2d', { willReadFrequently: true })
    })())
})()

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function rgba(css: string): [number, number, number, number] {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(css)
  if (m) return [+m[1]! / 255, +m[2]! / 255, +m[3]! / 255, m[4] === undefined ? 1 : +m[4]]
  const ctx = scratch() // oklch(), color(), anything else the page can compute
  if (!ctx) return [0, 0, 0, 1]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a ? [r! / a, g! / a, b! / a, a / 255] : [0, 0, 0, 0]
}

export function tokensOf(host: HTMLElement): Record<string, Token> {
  const theme = state(0)
  const known = new Map<string, Token>()
  let probe: HTMLElement | undefined
  let watching = false
  const bump = () => {
    known.clear()
    theme.value++
  }
  return new Proxy(
    {},
    {
      get(_, name): Token | undefined {
        if (typeof name !== 'string') return undefined
        void theme.value
        if (!watching) {
          watching = true
          const seen = new MutationObserver(bump)
          for (const el of [document.documentElement, document.body])
            seen.observe(el, { attributes: true })
          const dark =
            typeof matchMedia === 'function'
              ? matchMedia('(prefers-color-scheme: dark)')
              : undefined
          dark?.addEventListener('change', bump)
          onCleanup(() => {
            seen.disconnect()
            dark?.removeEventListener('change', bump)
          })
        }
        let token = known.get(name)
        if (!token) {
          const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
          probe ??= host.appendChild(Object.assign(document.createElement('i'), { hidden: true }))
          probe.style.color = `var(--${kebab}, var(--veneer-${kebab}))`
          const css = getComputedStyle(probe).color
          const [r, g, b, a] = rgba(css)
          token = { css, linear: [linear(r), linear(g), linear(b), a] }
          known.set(name, token)
        }
        return token
      },
    },
  )
}
