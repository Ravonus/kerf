import { derived, state } from '@weft-js/core'
import { Alert, Card } from '@weft-js/warp'

// The server enforces these in `media`'s `maxBytes`
// and the mutation's `z.file()`.
const LIMIT = 2 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Picked = {
  name: string
  bytes: number
  type: string
}
const size = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`

export default function UploadCheck() {
  const picked = state<Picked | undefined>(undefined)
  const problem = derived(() => {
    const f = picked.value
    if (!f) return ''
    if (!TYPES.includes(f.type))
      return (
        `${f.name} is ${f.type || 'not an image'}: ` +
        'pick a JPEG, PNG or WebP.'
      )
    if (f.bytes > LIMIT)
      return (
        `${f.name} is ${size(f.bytes)}, over the ` +
        `${size(LIMIT)} limit.`
      )
    return ''
  })
  const pick = (
    e: Event & { currentTarget: HTMLInputElement },
  ) => {
    const f = e.currentTarget.files?.[0]
    picked.value = f && {
      name: f.name,
      bytes: f.size,
      type: f.type,
    }
  }
  return (
    <Card title="Check it before it leaves the browser">
      <label>
        Photo{' '}
        <input
          type="file"
          accept={TYPES.join(',')}
          onChange={pick}
        />
      </label>
      {picked.value && (
        <Alert
          tone={problem.value ? 'critical' : 'positive'}
        >
          {problem.value ||
            `${picked.value.name}, ` +
              `${size(picked.value.bytes)}: ` +
              'this would be sent.'}
        </Alert>
      )}
    </Card>
  )
}
