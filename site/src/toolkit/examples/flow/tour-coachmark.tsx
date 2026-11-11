import { state } from '@kerf/core'
import {
  Button,
  Coachmark,
  Row,
  Stack,
  Text,
  Tour,
} from '@kerf/veneer'

const firstDeployDescription =
  'Connect a repository and your first ' +
  'deploy runs in about a minute.'

const rollbackDescription =
  'Puts the last good deploy back in ' +
  'about thirty seconds.'

const TOUR_STEPS = [
  {
    target: '[data-tour="new"]',
    title: 'Start a project',
    body: firstDeployDescription,
  },
  {
    target: '[data-tour="deploys"]',
    title: 'Follow every deploy',
    body: 'Failed ones land here first, with their logs.',
  },
  {
    target: '[data-tour="team"]',
    title: 'Bring your team',
    body: 'Invite people and choose what they can do.',
  },
]

export function TourDashboard() {
  const open = state(false)
  return (
    <Stack
      gap="group"
      align="center"
    >
      <Row gap="related">
        <Button
          data-tour="new"
          icon="plus"
        >
          New project
        </Button>
        <Button
          data-tour="deploys"
          emphasis="outline"
          tone="neutral"
        >
          Deploys
        </Button>
        <Button
          data-tour="team"
          emphasis="outline"
          tone="neutral"
        >
          Team
        </Button>
      </Row>
      <Button
        emphasis="link"
        onClick={() => (open.value = true)}
      >
        Take the tour
      </Button>
      <Tour
        steps={TOUR_STEPS}
        open={open}
      />
    </Stack>
  )
}

/**
 * The hub's card. The beacon uses the button's screen
 * position, which a scaled card can't follow, so the
 * card shows the marked control and the tip's words.
 */
export const CoachmarkTile = () => (
  <Stack
    gap="related"
    align="center"
  >
    <Button
      emphasis="outline"
      tone="neutral"
    >
      Roll back
    </Button>
    <Text role="label">One press rollback</Text>
    <Text subtle>
      Puts the last good deploy back in about thirty
      seconds.
    </Text>
  </Stack>
)

export function CoachmarkNewFeature() {
  const seen = state(false)
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Button
        data-coach="rollback"
        emphasis="outline"
        tone="neutral"
      >
        Roll back
      </Button>
      <Text subtle>
        {seen.value
          ? 'Dismissed. Save that in your app.'
          : 'Press the beacon on the button.'}
      </Text>
      <Coachmark
        target='[data-coach="rollback"]'
        title="One press rollback"
        body={rollbackDescription}
        onDismiss={() => (seen.value = true)}
      />
    </Stack>
  )
}

export const FRAMEWORKS = [
  { value: 'vite', label: 'Vite' },
  { value: 'next', label: 'Next.js' },
  { value: 'kerf', label: 'kerf' },
]

export const WIZARD = ['repo', 'build', 'review']
