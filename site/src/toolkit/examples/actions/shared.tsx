import type { Command, CommandMode } from '@weft-js/warp'
import { PEOPLE, PROJECTS } from '../../world'

export const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const

export const COMMANDS: Command[] = [
  { id: 'deploy', label: 'Deploy storefront', group: 'Projects', icon: 'rocket', shortcut: '⌘D' },
  { id: 'logs', label: 'Open logs', group: 'Projects', icon: 'external' },
  { id: 'settings', label: 'Open settings', group: 'Go to', icon: 'settings', shortcut: '⌘,' },
  { id: 'invite', label: 'Invite a teammate', group: 'Team', icon: 'user' },
]

/** Projects come from a search you run: return a promise and its rows land under the commands, without moving the active row. */
export const findProjects = async (query: string, signal: AbortSignal): Promise<Command[]> => {
  await new Promise((done) => {
    setTimeout(done, 250)
  })
  if (signal.aborted || !query) return []
  return PROJECTS.filter((p) => p.name.includes(query.toLowerCase())).map((p) => ({
    id: p.id,
    label: p.name,
    group: 'Projects',
    icon: 'folder',
    hint: `${p.region} · ${p.status}`,
  }))
}

/** A first character switches what is searched: `@` finds people and `#` finds projects. */
export const MODES: CommandMode[] = [
  {
    prefix: '@',
    label: 'People',
    placeholder: 'Find a teammate',
    commands: PEOPLE.map((p) => ({
      id: p.id,
      label: p.name,
      group: 'People',
      icon: 'user',
      hint: p.team,
    })),
  },
  {
    prefix: '#',
    label: 'Projects',
    placeholder: 'Find a project',
    commands: PROJECTS.map((p) => ({
      id: p.id,
      label: p.name,
      group: 'Projects',
      icon: 'folder',
      hint: p.region,
    })),
  },
]
