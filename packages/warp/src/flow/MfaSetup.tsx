import { DownloadIcon } from '@weft-js/warp-icons'
import { announce, copyText, mapFlowError } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { Modal } from '../Modal'
import { toast } from '../Toast'
import { Flow } from './Flow'
import { TextLink } from './kit'
import '@weft-js/warp-core/styles/layout/row.css'

/** Props for MfaSetup. */
export interface MfaSetupProps {
  open: State<boolean>
  /** The QR code: the app's SVG or image, with its own label. */
  /** Brings its own light plate, like QRCode: a code must stay dark on light in every theme. */
  qr?: unknown
  /** The key for "Can't scan?". */
  secret: string
  /** Checks the code: throw, or resolve false, when it's wrong. */
  onVerify: (code: string) => unknown
  /** Backup codes, shown once verified. */
  codes: string[]
  /** Default: saves `backup-codes.txt`. */
  onDownload?: (codes: string[]) => void
  onDone?: () => void
}

const STEPS = {
  scan: 'Step 1 of 3 · Scan the code with 1Password, Authy or Google Authenticator.',
  verify: 'Step 2 of 3 · Enter the code the app shows now.',
  codes: 'Step 3 of 3 · Save your backup codes.',
}

function save(codes: string[]) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([codes.join('\n')], { type: 'text/plain' }))
  a.download = 'backup-codes.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

/** MFA setup (09 §9, specimen `mfaSetup`): QR and key, confirm a code, backup codes; one dialog over a Flow. Finish waits for "I saved my backup codes". */
export function MfaSetup({ open, qr, secret, onVerify, codes, onDownload, onDone }: MfaSetupProps) {
  const step = state<keyof typeof STEPS>('scan')
  const code = state('')
  const problem = state<string | undefined>(undefined)
  const busy = state(false)
  const saved = state(false)
  const next = mfaNext(
    step,
    code,
    problem,
    busy,
    () => open,
    () => onVerify,
    () => onDone,
  )
  const label = derived(() => (step.value === 'codes' ? 'Finish' : 'Continue'))
  return (
    <Modal
      open={open}
      title="Set up an authenticator app"
      description={STEPS[step.value]}
      footer={
        <>
          <Button emphasis="frame" data-close="">
            Cancel
          </Button>
          <Button
            loading={busy.value}
            disabled={step.value === 'codes' && !saved.value}
            onClick={next}
          >
            {label.value}
          </Button>
        </>
      }
    >
      <Flow
        data-part="mfa"
        step={step}
        steps={[
          {
            id: 'scan',
            label: 'scan',
            render: () => <MfaScan qr={qr} secret={secret} />,
          },
          {
            id: 'verify',
            label: 'confirm',
            render: () => <MfaVerify problem={problem} code={code} next={next} />,
          },
          {
            id: 'codes',
            label: 'backup codes',
            render: () => <MfaCodes codes={codes} saved={saved} onDownload={onDownload} />,
          },
        ]}
      />
    </Modal>
  )
}

async function copy(text: string) {
  await copyText(document, text)
  announce(document, 'Copied')
}

function mfaNext(
  step: State<keyof typeof STEPS>,
  code: State<string>,
  problem: State<string | undefined>,
  busy: State<boolean>,
  open: () => MfaSetupProps['open'],
  onVerify: () => MfaSetupProps['onVerify'],
  onDone: () => MfaSetupProps['onDone'],
) {
  return async () => {
    if (step.value === 'scan') {
      step.value = 'verify'
      return
    }
    if (step.value === 'codes') {
      open().value = false
      onDone()?.()
      return
    }
    if (!/^\d{6}$/.test(code.value)) {
      problem.value = 'Enter the 6 digits from the app.'
      return
    }
    busy.value = true
    try {
      if ((await onVerify()(code.value)) === false)
        problem.value = "That code didn't match. Use the newest one."
      else {
        problem.value = undefined
        step.value = 'codes'
      }
    } catch (e) {
      const m = mapFlowError(e)
      if (m.surface === 'toast')
        toast.show({ title: m.title, description: m.description, tone: 'critical' })
      else problem.value = m.fields.code ?? m.title
    } finally {
      busy.value = false
    }
  }
}
function MfaScan({ qr, secret }: { qr: unknown; secret: string }) {
  return (
    <div data-scope="stack">
      {qr}
      <p>
        Can't scan? Enter this key: <code>{secret}</code>{' '}
        <TextLink onClick={() => copy(secret)}>Copy key</TextLink>
      </p>
    </div>
  )
}
function MfaVerify({
  problem,
  code,
  next,
}: {
  problem: State<string | undefined>
  code: State<string>
  next: () => Promise<void>
}) {
  return (
    <form
      novalidate
      onSubmit={(e: SubmitEvent) => {
        e.preventDefault()
        void next()
      }}
    >
      <Input
        label="6-digit code from the app"
        name="totp"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        hint=""
        error={problem.value}
        data-autofocus=""
        onInput={(e) => (code.value = e.currentTarget.value)}
      />
    </form>
  )
}
function MfaCodes({
  codes,
  saved,
  onDownload,
}: {
  codes: string[]
  saved: State<boolean>
  onDownload: MfaSetupProps['onDownload']
}) {
  return (
    <div data-scope="stack">
      <p>
        Each code works once if you lose your phone. Store them somewhere safe; you won't see them
        again.
      </p>
      <ol data-part="codes" aria-label="Backup codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <div data-scope="row">
        <Button emphasis="frame" size="sm" onClick={() => (onDownload ?? save)(codes)}>
          {() => (
            <>
              <DownloadIcon />
              Download
            </>
          )}
        </Button>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => copy(codes.join('\n'))}>
          Copy all
        </Button>
      </div>
      <Checkbox
        onChange={(e: Event) => (saved.value = (e.currentTarget as HTMLInputElement).checked)}
      >
        I saved my backup codes
      </Checkbox>
    </div>
  )
}
