// A name only known at runtime: the icon holds its box while it loads, on the server too, and fills in on the client. If it
// can't load, the box stays, marked data-failed, and the page carries on.
import { state } from 'weft'
import type { IconComponent, IconProps } from './svg'
import { icon, Svg } from './svg'

type Lookup = (name: string, variant?: string) => IconComponent | undefined | Promise<IconComponent | undefined>
const held = new Map<string, IconComponent>()

function deferred(key: string, find: () => Promise<IconComponent | undefined>): IconComponent {
  let made = held.get(key)
  if (made) return made
  let got: Promise<IconComponent | undefined> | undefined
  made = (props: IconProps) => {
    const ready = state<IconComponent | null>(null), failed = state(false)
    if (typeof window !== 'undefined') (got ??= find()).then(i => { if (i) ready.value = i; else failed.value = true }, () => { got = undefined; failed.value = true })
    return <>{ready.value ? ready.value(props) : <Svg {...props} data-loading={failed.value ? undefined : ''} data-failed={failed.value ? '' : undefined} html="" />}</>
  }
  held.set(key, made)
  return made
}

let loaded: Promise<Lookup> | undefined
/** From the pack, a chunk of its own: the first use on a page fetches it. */
export const late = (name: string, variant: string | undefined, pack: () => Promise<Lookup>) => deferred(`${name}:${variant ?? ''}`, async () => (await (loaded ??= pack()))(name, variant))

// Only paths go in, with their d and data attributes: what a remote host sends is data, never markup that can run.
const clean = (svg: string) => (svg.match(/<path(?:\s+data-[a-z]+(?:="[^"<>]*")?|\s+d="[^"<>]*")*\s*\/>/g) ?? []).join('')

/** From a host of static files (`weft icons publish`): one small fetch per icon. */
export const remote = (source: string) => (name: string, variant?: string) => deferred(`${name}:${variant ?? ''}`, async () => {
  const response = await fetch(`${source}${name}${variant ? `.${variant}` : ''}.svg`)
  if (!response.ok) return undefined
  const html = clean(await response.text())
  return html ? icon(html) : undefined
})
