// Which platform this bundle is for, the app's idiom, and the live window. The OS is a compile-time constant in weft
// (`platform.os` folded by the compiler); the spike injects it with esbuild's `--define:__WEFT_OS__`. The window is
// runtime state: the host reports it, and anything resolved from it re-resolves when it changes.
import table from '../../protocol/idioms.json'
import { derived, state } from './runtime'

export type OS = 'web' | 'ios' | 'android'
export type Idiom = keyof typeof table.idioms
export type Component = keyof typeof table.components
export type WindowClass = keyof typeof table.classes

declare const __WEFT_OS__: OS | undefined
export const platform: { os: OS; idiom: Idiom } = {
  os: typeof __WEFT_OS__ !== 'undefined' ? __WEFT_OS__ : 'web',
  idiom: 'blend',
}

/** Tests and the device entry set these before mounting. */
export function configure(p: Partial<typeof platform>) {
  Object.assign(platform, p)
}

// ---- window ----

export type Rect = { x: number; y: number; w: number; h: number }
/**
 * The area the app lays out in (already inside safe areas and system bars), in pt / dp. `hinge` is a fold or hinge
 * that separates the window into two panes; a flat fold that doesn't separate is not reported.
 */
export type WindowInfo = { w: number; h: number; hinge?: Rect }
export type Pane = Rect

export const viewport = state<WindowInfo>({ w: 390, h: 844 })

/** The host calls this on start and whenever the window changes. */
export function setViewport(w: WindowInfo) {
  const cur = viewport.value
  if (cur.w === w.w && cur.h === w.h && JSON.stringify(cur.hinge) === JSON.stringify(w.hinge))
    return
  viewport.value = w
}

/** One pane, or two either side of a separating hinge (side by side for a vertical hinge, stacked for a horizontal one). */
export const panes = derived<Pane[]>(() => {
  const { w, h, hinge } = viewport.value
  if (!hinge) return [{ x: 0, y: 0, w, h }]
  return hinge.h >= h
    ? [
        { x: 0, y: 0, w: hinge.x, h },
        { x: hinge.x + hinge.w, y: 0, w: w - hinge.x - hinge.w, h },
      ]
    : [
        { x: 0, y: 0, w, h: hinge.y },
        { x: 0, y: hinge.y + hinge.h, w, h: h - hinge.y - hinge.h },
      ]
})

export function classOf(w: WindowInfo): WindowClass {
  if (w.hinge) return 'dual' // side by side for a vertical hinge (book), stacked for a horizontal one (tabletop)
  return w.w < 600 ? 'compact' : w.w < 840 ? 'medium' : 'expanded'
}
export const windowClass = derived(() => classOf(viewport.value))

// ---- resolution ----

export type Resolution = { render: string; chain: string[] }
type Entry = string | Record<WindowClass, string>

/**
 * Decides how `component` renders here: the component's own `idiom` prop wins, then the app idiom, then the table,
 * then (for components that adapt to the window) the window class. Called inside a binding or `match`, it re-runs
 * when the window class changes. The chain says which step decided, so an agent can predict a result before building.
 */
export function resolve(
  component: Component,
  override?: Idiom,
  os: OS = platform.os,
  cls?: WindowClass,
): Resolution {
  const c = table.components[component]
  const idiom = override ?? platform.idiom
  const entry = (c.render as Record<OS, Record<Idiom, Entry>>)[os][idiom]
  const k = typeof entry === 'string' ? undefined : (cls ?? windowClass.value)
  const render = typeof entry === 'string' ? entry : entry[k!]
  const supported = table.hosts[os] as string[]
  if (!supported.includes(render))
    throw new Error(`${component} resolves to "${render}" on ${os}, which that host can't draw`)
  return {
    render,
    chain: [
      override ? `idiom="${override}" on this ${component}` : `app idiom "${idiom}"`,
      `${component} is ${c.class}: ${table.idioms[idiom]}`,
      k ? `${os} + ${idiom} + ${k} window → ${render}` : `${os} + ${idiom} → ${render}`,
      (c.why as Record<string, string>)[render],
    ],
  }
}

/** Every platform × idiom (× window class) for one component, as `weft design explain <Component>` prints it. */
export function explain(component: Component): string {
  const c = table.components[component]
  const lines = [`${component} (${c.class}): ${c.intent}`]
  for (const [os, byIdiom] of Object.entries(c.render) as [OS, Record<Idiom, Entry>][]) {
    const idioms = Object.keys(table.idioms) as Idiom[]
    if (idioms.every((i) => typeof byIdiom[i] === 'string')) {
      lines.push(`  ${os.padEnd(8)} ${idioms.map((i) => `${i}: ${byIdiom[i]}`).join('  ·  ')}`)
      continue
    }
    lines.push(`  ${os}`) // adapts to the window: one line per idiom, one entry per window class
    for (const i of idioms) {
      const e = byIdiom[i]
      lines.push(
        `    ${i.padEnd(7)} ${
          typeof e === 'string'
            ? e
            : Object.entries(e)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ')
        }`,
      )
    }
  }
  for (const [render, why] of Object.entries(c.why)) lines.push(`  ${render}: ${why}`)
  return lines.join('\n')
}
