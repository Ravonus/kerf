import {
  Alert,
  Button,
  Card,
  Textarea,
} from '@weft-js/warp'

type Status =
  | 'empty'
  | 'typing'
  | 'submitting'
  | 'success'
  | 'error'
const STATUSES: Status[] = [
  'empty',
  'typing',
  'submitting',
  'success',
  'error',
]

// The quiz drawn for one status, with no logic at all: a
// picture of each visual state.
function Form({ status }: { status: Status }) {
  return (
    <>
      {status === 'success' ? (
        <Alert tone="positive" title="That's right!" />
      ) : (
        <form>
          <Textarea
            label="Your answer"
            value={status === 'empty' ? '' : 'Lisbon'}
            disabled={status === 'submitting'}
            error={
              status === 'error'
                ? 'Good guess, but no.'
                : undefined
            }
          />
          <Button
            type="submit"
            loading={status === 'submitting'}
            disabled={status === 'empty'}
          >
            Submit
          </Button>
        </form>
      )}
    </>
  )
}

export default function Styleguide() {
  return (
    <>
      {STATUSES.map((s) => (
        <Card
          key={s}
          eyebrow="status"
          title={s}
        >
          <Form status={s} />
        </Card>
      ))}
    </>
  )
}
