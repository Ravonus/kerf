// The `image: 'auto'` default card (research 20 §4.1, §10): the page's title and description, the app's name and its
// address, on the app's look. Colours and faces come from `site.card`, which warp and the text plugin fill in; one
// image goes to every feed, so a card has one scheme, and each is checked against both kinds of feed.
import { untrack } from 'weft'
import type { CardColors, Site } from 'weft/ssr'
import { cardTitleSize } from '../derive.mjs'

export interface DefaultProps {
  title: string
  description: string
  site: Site
  path?: string
}

const SCHEMES: Record<'dark' | 'light', Required<CardColors>> = {
  dark: { background: '#100f0b', text: '#ebe8e0', subtle: '#a8a59d', accent: '#5fcf97' },
  light: { background: '#f7f4ec', text: '#1f1d18', subtle: '#615e56', accent: '#1f7a50' },
}

const family = (name: string | undefined) => (name ? `'${name}',Inter` : 'Inter')

/** The title without the template the site wraps around it: the card shows the site's name on its own. */
function heading(title: string, template: string | undefined) {
  const [before = '', after = ''] = template?.split('%s') ?? []
  return title.startsWith(before) && title.endsWith(after) && title.length > before.length + after.length ? title.slice(before.length, title.length - after.length) : title
}

/** Everything the card draws, worked out once: a card renders one time, to a string. */
function look({ title, description, site, path }: DefaultProps) {
  const card = site.card ?? {}
  const scheme = card.scheme ?? 'dark'
  const c = { ...SCHEMES[scheme], ...card[scheme] }
  for (const k of ['background', 'text', 'subtle', 'accent'] as const) if (card[k]) c[k] = card[k]!
  const host = site.url?.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const shown = heading(title, site.title)
  return {
    c, description, title: shown, name: site.name ?? '', size: cardTitleSize(shown),
    display: family(card.fonts?.display?.family), body: family(card.fonts?.body?.family),
    address: host && host + (path && path !== '/' ? path.replace(/[?#].*/, '') : ''),
  }
}

export function DefaultCard(props: DefaultProps) {
  const { c, title, description, name, size, display, body, address } = untrack(() => look(props))
  return (
    <div style={`display:flex;flex-direction:column;width:100%;height:100%;padding:68px 76px 60px;background-color:${c.background};color:${c.text};font-family:${body}`}>
      <div style={`display:flex;align-items:center;font-family:${display};font-size:32px;font-weight:600;letter-spacing:-0.3px`}>
        <div style={`width:22px;height:22px;border-radius:5px;background-color:${c.accent};margin-right:16px`} />
        <span>{name}</span>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;flex:1;min-height:0;padding:24px 0">
        <div style={`display:block;font-family:${display};font-size:${size}px;font-weight:700;line-height:1.08;letter-spacing:-1.5px;overflow-wrap:anywhere;line-clamp:3`}>{title}</div>
        {description ? <div style={`display:block;margin-top:26px;font-size:30px;line-height:1.38;color:${c.subtle};line-clamp:3`}>{description}</div> : null}
      </div>
      {address ? <div style={`display:flex;align-items:center;font-size:24px;color:${c.subtle};border-top:1px solid ${c.subtle}44;padding-top:22px`}>{address}</div> : null}
    </div>
  )
}
