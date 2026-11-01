import { navigate } from '@weft/start'
import { copyButtons, type SearchHit } from '@weft/ui-core'
import { BookIcon, BoxIcon, ClipboardIcon, FileTextIcon, GridIcon, HashIcon, MoonIcon, PlayIcon, SlidersIcon, StarIcon, SunIcon } from '@weft/icons'
import { CommandPalette, setDial, type Command, type CommandMode, type CommandSource } from '@weft/warp'
import { onMount } from 'weft'
import { body, loadTitles, titles } from '../lib/search'
import { spotlightOpen } from '../lib/spotlight'

const go = (href: string) => () => navigate(href)
const ORDER = ['Recent', 'Go to', 'API', 'Guides', 'Components', 'Diagnostics', 'Examples', 'Icons', 'In the text', 'Commands']
const ICON: Record<string, any> = { API: BoxIcon, Guides: BookIcon, Components: GridIcon, Diagnostics: HashIcon, Examples: PlayIcon, Icons: StarIcon, 'In the text': FileTextIcon }
const PER_GROUP = 4
const RECENT = 'weft:recent'

const PAGES: Command[] = [
  { label: 'Docs', group: 'Go to', icon: BookIcon, href: '/docs', run: go('/docs') },
  { label: 'Examples', group: 'Go to', icon: PlayIcon, href: '/examples', run: go('/examples') },
  { label: 'Toolkit', group: 'Go to', icon: GridIcon, href: '/toolkit', run: go('/toolkit') },
  { label: 'Icons', group: 'Go to', icon: StarIcon, href: '/icons', run: go('/icons') },
]
const COMMANDS: Command[] = [
  { label: 'Theme: light', group: 'Commands', icon: SunIcon, run: () => setDial('theme', 'light', { persist: true }) },
  { label: 'Theme: dark', group: 'Commands', icon: MoonIcon, run: () => setDial('theme', 'dark', { persist: true }) },
  { label: 'Theme: follow the system', group: 'Commands', icon: SlidersIcon, run: () => setDial('theme', 'auto', { persist: true }) },
  { label: 'Expression: quiet', group: 'Commands', icon: SlidersIcon, run: () => setDial('expression', 'quiet', { persist: true }) },
  { label: 'Expression: balanced', group: 'Commands', icon: SlidersIcon, run: () => setDial('expression', 'balanced', { persist: true }) },
  { label: 'Expression: vivid', group: 'Commands', icon: SlidersIcon, run: () => setDial('expression', 'vivid', { persist: true }) },
  {
    label: 'Copy this page as Markdown', group: 'Commands', icon: ClipboardIcon,
    run: () => { if (location.pathname.startsWith('/docs/')) void fetch(`${location.pathname}.md`).then(r => r.text()).then(t => navigator.clipboard?.writeText(t)) },
  },
  ...PAGES.map(p => ({ ...p, label: `Go to ${p.label}`, group: 'Commands' })),
]

function recent(): Command[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as { label: string; href: string }[]).map(r => ({ ...r, group: 'Recent', icon: FileTextIcon, run: go(r.href) }))
  } catch {
    return []
  }
}

function remember(c: Command) {
  if (!c.href) return
  try {
    const list = [{ label: c.label, href: c.href }, ...(JSON.parse(localStorage.getItem(RECENT) ?? '[]') as { href: string }[]).filter(r => r.href !== c.href)]
    localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 5)))
  } catch {}
}

const row = (h: SearchHit): Command => ({ label: h.title, group: h.group, icon: ICON[h.group], hint: h.fuzzy ? `Closest match${h.parent ? `, ${h.parent}` : ''}` : h.parent ?? h.text, href: h.url, run: go(h.url), id: h.url })

/** At most four to a group, and a row that opens the rest in place. */
function capped(hits: SearchHit[]) {
  const by = new Map<string, SearchHit[]>()
  for (const h of hits) by.has(h.group) ? by.get(h.group)!.push(h) : by.set(h.group, [h])
  return [...by.values()].flatMap(list => {
    const rows = list.slice(0, PER_GROUP).map(row)
    if (list.length > PER_GROUP) rows.push({ label: `Show all ${list.length} in ${list[0].group}`, group: list[0].group, children: () => list.map(row) })
    return rows
  })
}

const titlesSource: CommandSource = q => {
  if (!q.trim()) return [...recent(), ...PAGES]
  const hits = titles(q)
  // A key press before T0 lands is answered when it does: the input never waits.
  return hits ? capped(hits) : loadTitles().then(() => capped(titles(q) ?? []))
}

const bodySource: CommandSource = (q, signal) => {
  if (q.trim().length < 3) return []
  return body(q, signal).then(hits => hits.slice(0, 6).map(h => ({ ...row(h), group: 'In the text' })))
}

const only = (group: string): CommandSource => q => (titles(q || ' ') ?? []).filter(h => h.group === group).slice(0, 20).map(row)

const MODES: CommandMode[] = [
  { prefix: '>', label: 'Commands', placeholder: 'Run a command…', commands: COMMANDS },
  { prefix: '@', label: 'Components', placeholder: 'Search components…', sources: [only('Components')] },
  { prefix: '#', label: 'Examples', placeholder: 'Search examples…', sources: [only('Examples')] },
]

/** The ⌘K launcher, in the shell so opening it fetches nothing. Search and commands are one surface. */
export function Spotlight() {
  onMount(() => {
    const stop = copyButtons()
    const start = () => void loadTitles()
    const idle = (globalThis as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200))
    idle(start)
    return stop
  })
  return <CommandPalette open={spotlightOpen} onOpenChange={v => (spotlightOpen.value = v)} slash sources={[titlesSource, bodySource]} modes={MODES} groupOrder={ORDER} onRun={remember} label="Search weft" placeholder="Search docs, components, codes…   > for commands" />
}
