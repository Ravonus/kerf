import { state } from '@weft-js/core'
import {
  Stack,
  Switch,
  Toaster,
  toast,
} from '@weft-js/warp'

const previewHint =
  'Every pull request gets its own address.'
const pauseHint =
  'Takes the project offline until you switch it back.'

export function SwitchSettings() {
  const previews = state(true)
  const analytics = state(false)
  const paused = state(false)
  const say = (title: string, on: boolean) =>
    toast.show({ title: `${title} ${on ? 'on' : 'off'}` })
  return (
    <Stack
      gap="group"
      divided
    >
      <Switch
        checked={previews.value}
        hint={previewHint}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) =>
          say(
            'Preview deploys',
            (previews.value = e.currentTarget.checked),
          )
        }
      >
        Preview deploys
      </Switch>
      <Switch
        checked={analytics.value}
        hint="Adds about 1 KB to each page."
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) =>
          say(
            'Web analytics',
            (analytics.value = e.currentTarget.checked),
          )
        }
      >
        Web analytics
      </Switch>
      <Switch
        checked={paused.value}
        hint={pauseHint}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) =>
          say(
            'Pause',
            (paused.value = e.currentTarget.checked),
          )
        }
      >
        Pause project
      </Switch>
      <Toaster />
    </Stack>
  )
}
