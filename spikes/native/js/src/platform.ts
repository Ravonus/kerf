// Which platform this bundle is for, and the app's idiom. In weft this is a compile-time constant (`platform.os`
// folded by the compiler); the spike injects it with esbuild's `--define:__WEFT_OS__`.
import table from '../../protocol/idioms.json'

export type OS = 'web' | 'ios' | 'android'
export type Idiom = keyof typeof table.idioms
export type Component = keyof typeof table.components

declare const __WEFT_OS__: OS | undefined
export const platform: { os: OS; idiom: Idiom } = {
  os: typeof __WEFT_OS__ !== 'undefined' ? __WEFT_OS__ : 'web',
  idiom: 'blend',
}

/** Tests and the device entry set these before mounting. */
export function configure(p: Partial<typeof platform>) { Object.assign(platform, p) }

export type Resolution = { render: string; chain: string[] }

/**
 * Decides how `component` renders on this platform: the component's own `idiom` prop wins, then the app idiom,
 * then the table. The chain says which step decided, so an agent can predict a result before building it.
 */
export function resolve(component: Component, override?: Idiom, os: OS = platform.os): Resolution {
  const c = table.components[component]
  const idiom = override ?? platform.idiom
  const render = c.render[os][idiom]
  const supported = table.hosts[os] as string[]
  if (!supported.includes(render)) throw new Error(`${component} resolves to "${render}" on ${os}, which that host can't draw`)
  return {
    render,
    chain: [
      override ? `idiom="${override}" on this ${component}` : `app idiom "${idiom}"`,
      `${component} is ${c.class}: ${table.idioms[idiom]}`,
      `${os} + ${idiom} → ${render}`,
      (c.why as Record<string, string>)[render],
    ],
  }
}

/** Every platform × idiom for one component, as `weft design explain <Component>` prints it. */
export function explain(component: Component): string {
  const c = table.components[component]
  const lines = [`${component} (${c.class}): ${c.intent}`]
  for (const os of Object.keys(c.render) as OS[]) {
    const row = (Object.keys(table.idioms) as Idiom[]).map(i => `${i}: ${c.render[os][i]}`).join('  ·  ')
    lines.push(`  ${os.padEnd(8)} ${row}`)
  }
  for (const [render, why] of Object.entries(c.why)) lines.push(`  ${render}: ${why}`)
  return lines.join('\n')
}
