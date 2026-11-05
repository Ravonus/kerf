import { DEV, effect, getOwner, onCleanup, state, within, type State } from '@weft-js/core'
import type { SurfaceDef, SurfaceBackend, SurfaceRenderer } from '../surface'
import { integerFit } from './integer-fit'
import { builtin } from './backends'
import { bootPainting } from './painting'

function createCanvas(
  def: Mounting,
  props: Record<string, unknown> & { label?: string; decorative?: boolean },
  host: HTMLElement,
) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = def.pixel
    ? 'position:absolute;inset:0;margin:auto;image-rendering:pixelated'
    : 'position:absolute;inset:0;width:100%;height:100%'
  effect(
    () => [props.label, props.decorative] as const,
    ([label, decorative]) => {
      if (decorative) canvas.setAttribute('aria-hidden', 'true')
      else {
        canvas.removeAttribute('aria-hidden')
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', label ?? def.name)
      }
    },
  )
  host.prepend(canvas)
  onCleanup(() => canvas.remove())

  if (DEV && def.props) {
    effect(
      () => ({ ...props }),
      (value) => {
        const result = def.props!['~standard'].validate(value) as {
          issues?: readonly {
            message: string
            path?: readonly (PropertyKey | { key: PropertyKey })[]
          }[]
        }
        for (const i of result.issues ?? [])
          console.warn(
            `weft: <Surface use={${def.name}}> prop \`${(i.path ?? []).map((p) => String(((p as { key?: PropertyKey })?.key ?? p) as PropertyKey)).join('.')}\`: ${i.message}`,
          )
      },
    )
  }

  return canvas
}

function fitCanvas(
  def: Mounting,
  canvas: HTMLCanvasElement,
  backend: SurfaceBackend,
  size: State<{ width: number; height: number }>,
  dpr: State<number>,
  scale: State<number>,
) {
  return (width: number, height: number, deviceWidth?: number, deviceHeight?: number) => {
    const device = devicePixelRatio || 1
    const d = Math.min(device, def.maxDpr ?? 2)
    if (def.pixel) {
      const f = integerFit(def.pixel.width, def.pixel.height, width, height)
      canvas.width = def.pixel.width
      canvas.height = def.pixel.height
      canvas.style.width = `${f.width}px`
      canvas.style.height = `${f.height}px`
      scale.value = f.scale
      backend.resize?.(def.pixel.width, def.pixel.height, 1)
      if (size.value.width !== def.pixel.width)
        size.value = { width: def.pixel.width, height: def.pixel.height }
    } else {
      canvas.width = Math.round((deviceWidth ?? width * device) * (d / device))
      canvas.height = Math.round((deviceHeight ?? height * device) * (d / device))
      backend.resize?.(width, height, d)
      if (size.value.width !== width || size.value.height !== height) size.value = { width, height }
    }
    dpr.value = d
  }
}

function observeSize(
  host: HTMLElement,
  fit: (width: number, height: number, deviceWidth?: number, deviceHeight?: number) => void,
  repaint: () => void,
) {
  const box = host.getBoundingClientRect()
  fit(box.width, box.height)
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1]!
      const dp = e.devicePixelContentBoxSize?.[0]
      const exact = dp && Math.abs(dp.inlineSize - e.contentRect.width * devicePixelRatio) < 2 // emulated dpr: the box is in other units
      fit(
        e.contentRect.width,
        e.contentRect.height,
        exact ? dp.inlineSize : undefined,
        exact ? dp.blockSize : undefined,
      )
      repaint() // now, not on a frame: setting the size cleared the canvas, and this callback runs before the browser paints
    })
    try {
      ro.observe(host, { box: 'device-pixel-content-box' })
    } catch {
      ro.observe(host)
    } // Safari has no such box
    onCleanup(() => ro.disconnect())
  }
}

type StartArgs = {
  def: Mounting
  props: Record<string, unknown>
  host: HTMLElement
  canvas: HTMLCanvasElement
  size: State<{ width: number; height: number }>
  dpr: State<number>
  scale: State<number>
  fps: number
  owner: NonNullable<ReturnType<typeof getOwner>>
  live: () => boolean
}

function startSurface(renderer: SurfaceRenderer, args: StartArgs) {
  const { def, props, host, canvas, size, dpr, scale, fps, owner, live } = args
  if (!live()) return
  const backend = renderer.context(canvas, def)
  if (!backend) {
    console.error(`weft: <Surface use={${def.name}}>: this browser has no \`${def.kind}\` context.`)
    host.setAttribute('data-surface-error', def.kind)
    return
  }
  onCleanup(() => backend.dispose?.())

  const fit = fitCanvas(def, canvas, backend, size, dpr, scale)

  let stop: (() => void) | undefined
  let repaint = () => {}

  const boot = () => {
    if (!live()) return
    bootPainting(
      { def, props, host, canvas, backend, size, dpr, scale, fps },
      owner,
      (dispose) => {
        stop = dispose
      },
      (paint) => {
        repaint = paint
      },
    )
  }

  observeSize(host, fit, () => repaint())

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    stop?.()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    const b = host.getBoundingClientRect()
    fit(b.width, b.height)
    boot()
  })
  onCleanup(() => stop?.())
  boot()
}

// ---- mounting ------------------------------------------------------------------------------------------------------

export type Mounting = SurfaceDef<Record<string, unknown>, string>

export function mountSurface(
  def: Mounting,
  props: Record<string, unknown> & { label?: string; decorative?: boolean },
  host: HTMLElement,
) {
  const fps = def.fps ?? 60
  const canvas = createCanvas(def, props, host)

  const size = state({ width: 0, height: 0 })
  const dpr = state(1)
  const scale = state(1)
  const owner = getOwner()!
  let live = true
  onCleanup(() => {
    live = false
  })

  const start = (renderer: SurfaceRenderer) =>
    startSurface(renderer, {
      def,
      props,
      host,
      canvas,
      size,
      dpr,
      scale,
      fps,
      owner,
      live: () => live,
    })

  const known = builtin[def.kind]
  if (known) start(known)
  else {
    import('weft:slot/surface.renderer')
      .then((m) => m.load(def.kind) as Promise<SurfaceRenderer>)
      .then(
        (r) => within(owner, () => start(r)),
        (error: unknown) => {
          console.error(error)
          host.setAttribute('data-surface-error', def.kind)
        },
      )
  }
}
