import { state } from '@kerf/core'
import {
  Button,
  ConnBanner,
  RateLimited,
  ShortcutsOverlay,
  Stack,
  SystemPage,
  Text,
} from '@kerf/veneer'
import { createShortcuts } from '@kerf/veneer-core'
import { wait } from './sign-in'

const firstDeployDescription =
  'Connect a repository and your first ' +
  'deploy runs in about a minute.'

const newBuildDescription =
  'A new build went out while this tab was open.'

export function SystemPage500() {
  const tries = state(0)
  return (
    <SystemPage
      as="h3"
      kind="500"
      onRetry={() => tries.value++}
      secondary={{ label: 'Status page' }}
      requestId={`req_1a9f-${tries.value}`}
    />
  )
}

export const SystemPageMaintenance = () => (
  <SystemPage
    as="h3"
    kind="maintenance"
    backAt="14:00 UTC"
    secondary={{ label: 'Status page' }}
  />
)

export const SystemPageEmpty = () => (
  <SystemPage
    as="h3"
    kind="empty"
    title="No projects yet"
    description={firstDeployDescription}
    primary={{ label: 'New project' }}
    secondary={{ label: 'Import' }}
  />
)

export function ConnBannerOffline() {
  const online = state(false)
  const reconnect = async () => {
    await wait(800)
    online.value = true
  }
  return (
    <Stack gap="related">
      <ConnBanner
        online={online.value}
        retryIn={4}
        changes={3}
        onRetry={() => void reconnect()}
      />
      <Button
        size="sm"
        emphasis="outline"
        tone="neutral"
        onClick={() => (online.value = !online.value)}
      >
        {online.value ? 'Go offline' : 'Come back online'}
      </Button>
    </Stack>
  )
}

export function ConnBannerNewVersion() {
  const stale = state(true)
  return (
    <Stack gap="related">
      <ConnBanner
        stale={stale.value}
        name="kerf"
        onReload={() => (stale.value = false)}
        onLater={() => (stale.value = false)}
      />
      <Text subtle>
        {stale.value ? newBuildDescription : 'Dismissed.'}
      </Text>
    </Stack>
  )
}

const EXPORT_BUTTON = {
  children: 'Export CSV',
  emphasis: 'outline',
  tone: 'neutral',
} as const

export const RateLimitedExport = () => (
  <RateLimited
    retryAfter={12}
    title="Export limit reached."
    description="You can run 5 exports a minute."
    trigger={EXPORT_BUTTON}
  />
)

const KEYS = createShortcuts()

KEYS.register({
  keys: 'g d',
  label: 'Go to deploys',
  group: 'Navigate',
  run() {},
})

KEYS.register({
  keys: 'g p',
  label: 'Go to projects',
  group: 'Navigate',
  run() {},
})

KEYS.register({
  keys: 'n',
  label: 'New project',
  group: 'Projects',
  run() {},
})

KEYS.register({
  keys: 'mod+k',
  label: 'Open the command palette',
  group: 'General',
  run() {},
})

export function ShortcutsOverlayApp() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Keyboard shortcuts
      </Button>
      <ShortcutsOverlay
        open={open}
        shortcuts={KEYS}
      />
    </>
  )
}
