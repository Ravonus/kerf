import { state, untrack } from '@weft-js/core'
import {
  Button,
  Chip,
  CommandPalette,
  Input,
  Menu,
  Row,
  Stack,
  Text,
  Toggle,
  Toaster,
  toast,
} from '@weft-js/warp'
import type { ButtonProps, Command, CommandMode } from '@weft-js/warp'
import { PEOPLE, PROJECTS, REGIONS } from '../world'

export const ButtonPlay = (p: ButtonProps) => <Button {...p} />

export const ButtonDefault = () => <Button>Deploy</Button>

export const ButtonEmphasis = () => (
  <>
    <Button>Deploy</Button>
    <Button emphasis="frame">Deploy</Button>
    <Button emphasis="soft">Deploy</Button>
    <Button emphasis="outline">Deploy</Button>
    <Button emphasis="ghost">Deploy</Button>
    <Button emphasis="link">Deploy</Button>
  </>
)

const TONES = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const

export const ButtonTones = () => (
  <Stack gap="related">
    {TONES.map((tone) => (
      <Row key={tone} gap="related">
        <Button tone={tone}>Deploy</Button>
        <Button tone={tone} emphasis="soft">
          Deploy
        </Button>
        <Button tone={tone} emphasis="outline">
          Deploy
        </Button>
        <Button tone={tone} emphasis="ghost">
          Deploy
        </Button>
      </Row>
    ))}
  </Stack>
)

export const ButtonSizes = () => (
  <>
    <Button size="sm">Deploy</Button>
    <Button>Deploy</Button>
    <Button size="lg">Deploy</Button>
  </>
)

export const ButtonFollow = () => (
  <>
    <Button>Wipe</Button>
    <Button follow>Follow</Button>
    <Button follow emphasis="soft">
      Follow
    </Button>
    <Button follow emphasis="outline" tone="neutral">
      Follow
    </Button>
  </>
)

export const ButtonWithIcon = () => (
  <>
    <Button icon="rocket">Deploy</Button>
    <Button emphasis="outline" tone="neutral" icon="plus">
      New project
    </Button>
    <Button emphasis="ghost" tone="critical" icon="trash">
      Delete
    </Button>
  </>
)

export const ButtonIconOnly = () => (
  <>
    <Button icon="plus" label="New project" />
    <Button emphasis="outline" tone="neutral" icon="settings" label="Settings" />
    <Button emphasis="ghost" tone="neutral" icon="trash" label="Delete" />
  </>
)

export const ButtonFull = () => <Button full>Deploy to production</Button>

export const ButtonLoading = () => (
  <>
    <Button loading>Deploying</Button>
    <Button emphasis="outline" tone="neutral" loading>
      Deploying
    </Button>
  </>
)

export const ButtonDisabled = () => (
  <>
    <Button aria-disabled="true">Deploy</Button>
    <Button emphasis="outline" tone="neutral" aria-disabled="true">
      Deploy
    </Button>
    <Button disabled>Deploy</Button>
  </>
)

export const ButtonDeleteProject = () => (
  <Stack gap="related">
    <Text role="heading">Delete storefront?</Text>
    <Text subtle>Its 412 deploys and all its logs go too. This can't be undone.</Text>
    <Row gap="related" justify="end">
      <Button emphasis="ghost" tone="neutral">
        Keep it
      </Button>
      <Button tone="critical">Delete project</Button>
    </Row>
  </Stack>
)

export const ButtonFormFooter = () => (
  <Stack as="form" gap="group" onSubmit={(e: Event) => e.preventDefault()}>
    <Input label="Project name" defaultValue="storefront" />
    <Row gap="related" justify="end">
      <Button emphasis="ghost" tone="neutral">
        Cancel
      </Button>
      <Button type="submit">Save changes</Button>
    </Row>
  </Stack>
)

export const ButtonEmptyState = () => (
  <Stack gap="related" align="center">
    <Text role="heading">No projects yet</Text>
    <Text subtle>Connect a repository and your first deploy runs in about a minute.</Text>
    <Button icon="plus">New project</Button>
  </Stack>
)

export function ButtonSaveAsync() {
  const saving = state(false)
  const save = async () => {
    saving.value = true
    await new Promise((done) => {
      setTimeout(done, 1500)
    })
    saving.value = false
    toast.show({ title: 'Saved', description: 'Your changes are live.' })
  }
  return (
    <>
      <Button loading={saving.value} onClick={save}>
        {saving.value ? 'Saving' : 'Save changes'}
      </Button>
      <Toaster />
    </>
  )
}

export function TogglePlay(p: { children: string; pressed: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const on = state(untrack(() => p.pressed))
  return (
    <Toggle size={p.size} pressed={on.value} onClick={() => (on.value = !on.value)}>
      {p.children}
    </Toggle>
  )
}

export function ToggleToolbar() {
  const bold = state(true)
  const italic = state(false)
  const code = state(false)
  return (
    <Row gap="tight">
      <Toggle pressed={bold.value} onClick={() => (bold.value = !bold.value)}>
        Bold
      </Toggle>
      <Toggle pressed={italic.value} onClick={() => (italic.value = !italic.value)}>
        Italic
      </Toggle>
      <Toggle pressed={code.value} onClick={() => (code.value = !code.value)}>
        Code
      </Toggle>
    </Row>
  )
}

export function ToggleSizes() {
  const small = state(true)
  const medium = state(true)
  const large = state(true)
  return (
    <>
      <Toggle size="sm" pressed={small.value} onClick={() => (small.value = !small.value)}>
        Bold
      </Toggle>
      <Toggle pressed={medium.value} onClick={() => (medium.value = !medium.value)}>
        Bold
      </Toggle>
      <Toggle size="lg" pressed={large.value} onClick={() => (large.value = !large.value)}>
        Bold
      </Toggle>
    </>
  )
}

export function ToggleIconOnly() {
  const pinned = state(true)
  return (
    <Toggle
      icon="pin"
      label="Pin this project"
      pressed={pinned.value}
      onClick={() => (pinned.value = !pinned.value)}
    />
  )
}

export function ToggleWatch() {
  const watching = state(false)
  return (
    <Row justify="between" gap="group">
      <Stack gap="hair">
        <Text role="heading">storefront</Text>
        <Text subtle>
          {watching.value ? 'You get a note on every deploy.' : 'No notes from this project.'}
        </Text>
      </Stack>
      <Toggle
        size="sm"
        icon="bell"
        pressed={watching.value}
        onClick={() => (watching.value = !watching.value)}
      >
        Watch
      </Toggle>
    </Row>
  )
}

export function ChipPlay(p: { children: string; pressed: boolean; count: number }) {
  const on = state(untrack(() => p.pressed))
  return (
    <Chip
      pressed={on.value}
      count={p.count < 0 ? undefined : p.count}
      onClick={() => (on.value = !on.value)}
    >
      {p.children}
    </Chip>
  )
}

export function ChipFilters() {
  const on = state(['Live'])
  const flip = (name: string) =>
    (on.value = on.value.includes(name) ? on.value.filter((n) => n !== name) : [...on.value, name])
  return (
    <Row gap="tight">
      {['Live', 'Building', 'Failed', 'Paused'].map((name) => (
        <Chip
          key={name}
          pressed={on.value.includes(name)}
          count={PROJECTS.filter((p) => p.status === name).length}
          onClick={() => flip(name)}
        >
          {name}
        </Chip>
      ))}
    </Row>
  )
}

export function ChipIcons() {
  const mine = state(true)
  const starred = state(false)
  return (
    <Row gap="tight">
      <Chip icon="user" pressed={mine.value} onClick={() => (mine.value = !mine.value)}>
        Mine
      </Chip>
      <Chip icon="star" pressed={starred.value} onClick={() => (starred.value = !starred.value)}>
        Starred
      </Chip>
    </Row>
  )
}

export function ChipFilterList() {
  const on = state(['Failed', 'Building'])
  const flip = (name: string) =>
    (on.value = on.value.includes(name) ? on.value.filter((n) => n !== name) : [...on.value, name])
  const shown = () =>
    PROJECTS.filter((p) => !on.value.length || on.value.includes(p.status)).slice(0, 4)
  return (
    <Stack gap="group">
      <Row gap="tight">
        {['Live', 'Building', 'Failed'].map((name) => (
          <Chip key={name} pressed={on.value.includes(name)} onClick={() => flip(name)}>
            {name}
          </Chip>
        ))}
      </Row>
      <Stack gap="tight">
        {shown().map((p) => (
          <Row key={p.id} justify="between">
            <Text>{p.name}</Text>
            <Text subtle>{p.status}</Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}

export const MenuBasic = () => (
  <Menu
    label="Actions"
    items={[
      { label: 'Rename', icon: 'pencil', shortcut: '⌘R' },
      { label: 'Duplicate', icon: 'copy', shortcut: '⌘D' },
      { separator: true },
      { label: 'Delete', icon: 'trash', tone: 'critical' },
    ]}
  />
)

export const MenuGroups = () => (
  <Menu
    label="Deploy to"
    items={[
      { group: 'Production' },
      { label: 'eu-west' },
      { label: 'us-east' },
      { group: 'Preview' },
      { label: 'staging' },
    ]}
  />
)

export const MenuTrigger = () => (
  <>
    <Menu
      label="Sort"
      trigger={{ emphasis: 'ghost', tone: 'neutral' }}
      items={[{ label: 'Newest' }, { label: 'Oldest' }]}
    />
    <Menu
      label="Export"
      trigger={{ emphasis: 'soft' }}
      items={[{ label: 'CSV' }, { label: 'JSON' }]}
    />
    <Menu
      label="More"
      trigger={{ emphasis: 'outline', tone: 'neutral', size: 'sm' }}
      items={[{ label: 'Archive' }]}
    />
  </>
)

export const MenuRowActions = () => (
  <Row justify="between" gap="group">
    <Stack gap="hair">
      <Text role="heading">checkout</Text>
      <Text subtle>Live in eu-west</Text>
    </Stack>
    <Menu
      label="Manage"
      align="end"
      trigger={{ emphasis: 'ghost', tone: 'neutral', size: 'sm' }}
      items={[
        { label: 'Open logs', icon: 'external' },
        { label: 'Redeploy', icon: 'rocket' },
        { separator: true },
        { label: 'Pause', tone: 'critical' },
      ]}
    />
  </Row>
)

const COMMANDS: Command[] = [
  { id: 'deploy', label: 'Deploy storefront', group: 'Projects', icon: 'rocket', shortcut: '⌘D' },
  { id: 'logs', label: 'Open logs', group: 'Projects', icon: 'external' },
  { id: 'settings', label: 'Open settings', group: 'Go to', icon: 'settings', shortcut: '⌘,' },
  { id: 'invite', label: 'Invite a teammate', group: 'Team', icon: 'user' },
]

export function CommandPaletteBasic() {
  const open = state(false)
  return (
    <>
      <Button emphasis="outline" tone="neutral" icon="search" onClick={() => (open.value = true)}>
        Search commands
      </Button>
      <CommandPalette open={open} hotkey="" commands={COMMANDS} />
    </>
  )
}

export function CommandPaletteRun() {
  const open = state(false)
  const last = state('Nothing yet')
  return (
    <Stack gap="related" align="center">
      <Button onClick={() => (open.value = true)}>Open the palette</Button>
      <Text subtle>Last run: {last.value}</Text>
      <CommandPalette
        open={open}
        hotkey=""
        commands={COMMANDS}
        onRun={(c) => (last.value = c.label)}
      />
    </Stack>
  )
}

/** A row with `children` opens a second list in place, and each child's `run` does the work. */
export function CommandPaletteNested() {
  const open = state(false)
  const region = state('eu-west')
  const commands: Command[] = [
    {
      id: 'region',
      label: 'Move storefront to…',
      title: 'Region',
      group: 'Projects',
      icon: 'globe',
      children: () =>
        REGIONS.map(({ region: r }) => ({
          id: r,
          label: r,
          group: 'Regions',
          icon: 'pin',
          run: () => (region.value = r),
        })),
    },
    { id: 'deploy', label: 'Deploy storefront', group: 'Projects', icon: 'rocket', shortcut: '⌘D' },
  ]
  return (
    <Stack gap="related" align="center">
      <Button emphasis="outline" tone="neutral" icon="search" onClick={() => (open.value = true)}>
        Search commands
      </Button>
      <Text subtle>storefront runs in {region.value}</Text>
      <CommandPalette open={open} hotkey="" commands={commands} />
    </Stack>
  )
}

/** Projects come from a search you run: return a promise and its rows land under the commands, without moving the active row. */
const findProjects = async (query: string, signal: AbortSignal): Promise<Command[]> => {
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

export function CommandPaletteSearch() {
  const open = state(false)
  const last = state('Nothing yet')
  return (
    <Stack gap="related" align="center">
      <Button emphasis="outline" tone="neutral" icon="search" onClick={() => (open.value = true)}>
        Find a project
      </Button>
      <Text subtle>Opened: {last.value}</Text>
      <CommandPalette
        open={open}
        hotkey=""
        placeholder="Search projects, like store or api"
        commands={COMMANDS}
        sources={[findProjects]}
        onRun={(c) => (last.value = c.label)}
      />
    </Stack>
  )
}

/** A first character switches what is searched: `@` finds people and `#` finds projects. */
const MODES: CommandMode[] = [
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

export function CommandPaletteModes() {
  const open = state(false)
  return (
    <Stack gap="related" align="center">
      <Button emphasis="outline" tone="neutral" icon="search" onClick={() => (open.value = true)}>
        Search everything
      </Button>
      <Text subtle>Type @ for people or # for projects.</Text>
      <CommandPalette
        open={open}
        hotkey=""
        commands={COMMANDS}
        modes={MODES}
        groupOrder={['Go to', 'Projects', 'Team']}
      />
    </Stack>
  )
}

export const MenuPlacement = () => (
  <>
    {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
      <Menu
        key={side}
        label={side}
        side={side}
        trigger={{ emphasis: 'outline', tone: 'neutral' }}
        items={[{ label: 'Rename' }, { label: 'Duplicate' }, { label: 'Archive' }]}
      />
    ))}
  </>
)

export const MenuAlignment = () => (
  <>
    {(['start', 'center', 'end'] as const).map((align) => (
      <Menu
        key={align}
        label={align}
        align={align}
        trigger={{ emphasis: 'outline', tone: 'neutral' }}
        items={[{ label: 'Rename' }, { label: 'Duplicate' }, { label: 'Archive' }]}
      />
    ))}
  </>
)
