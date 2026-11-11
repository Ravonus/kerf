import { state } from '@kerf/core'
import { Button, Toaster, toast } from '@kerf/veneer'

export type ToastTone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'caution'
  | 'critical'
  | 'info'

export function ToasterPlay({
  title,
  description,
  tone,
  action,
}: {
  title: string
  description: string
  tone: ToastTone
  action: boolean
}) {
  const show = () =>
    toast.show({
      title,
      description,
      tone,
      action: action
        ? { label: 'Undo', onClick: () => {} }
        : undefined,
    })
  return (
    <>
      <Button onClick={show}>Show the toast</Button>
      <Toaster />
    </>
  )
}

export const ToasterBasic = () => (
  <>
    <Button
      onClick={() =>
        toast.show({
          title: 'Saved',
          description: 'Your changes are live.',
        })
      }
    >
      Save changes
    </Button>
    <Toaster />
  </>
)

const TONES = [
  'neutral',
  'positive',
  'info',
  'caution',
  'critical',
] as const

export const ToasterTones = () => (
  <>
    {TONES.map((tone) => (
      <Button
        key={tone}
        emphasis="outline"
        tone={tone}
        onClick={() =>
          toast.show({ title: 'Deploy finished', tone })
        }
      >
        {tone}
      </Button>
    ))}
    <Toaster />
  </>
)

export function ToasterUndo() {
  const archived = state(false)
  const archive = () => {
    archived.value = true
    toast.show({
      title: 'reports archived',
      action: {
        label: 'Undo',
        onClick: () => (archived.value = false),
      },
    })
  }
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        disabled={archived.value}
        onClick={archive}
      >
        {archived.value ? 'Archived' : 'Archive reports'}
      </Button>
      <Toaster />
    </>
  )
}

const wait = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms)
  })

export const ToasterPromise = () => {
  const deploy = () =>
    toast.promise(wait(2200), {
      pending: {
        title: 'Deploying storefront',
        description: 'This takes about two seconds.',
      },
      done: {
        title: 'storefront is live',
        description: 'Serving 9f3ac21 in eu-west.',
      },
      error: 'The deploy failed',
    })
  return (
    <>
      <Button
        icon="rocket"
        onClick={deploy}
      >
        Deploy
      </Button>
      <Toaster />
    </>
  )
}

export const ToasterSeveral = () => {
  const many = () =>
    [
      'eu-west',
      'us-east',
      'ap-south',
      'eu-north',
    ].forEach((region, i) =>
      setTimeout(
        () =>
          toast.show({
            title: `${region} is up to date`,
            tone: 'positive',
          }),
        i * 250,
      ),
    )
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={many}
      >
        Roll out to four regions
      </Button>
      <Toaster />
    </>
  )
}
