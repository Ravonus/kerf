import { AlertIcon, CheckIcon, RightIcon, XIcon } from '@kerf/veneer-icons'
import {
  announce,
  argsDiff,
  installSweep,
  toolStatus,
  uid,
  type AgentTool,
} from '@kerf/veneer-core'
import { derived, onMount, state, untrack, watch, type State } from '@kerf/core'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Sweep } from './bits'
import '../styles'
import '@kerf/veneer-core/styles/components/spinner.css'
import '@kerf/veneer-core/styles/app/tool-call.css'

/** Props for ToolCall. */
export interface ToolCallProps {
  call: AgentTool
  /** Called with the arguments as edited, and whether "always allow" is ticked. Approval never auto-runs. */
  onApprove?: (args: string, always: boolean) => void
  /** Called when the call is denied. */
  onDeny?: () => void
  /** The "always allow" line, scoped to tool and resource: "Always allow edits in src/calendar". */
  alwaysAllow?: string | undefined
  /** Was there on load: takes no focus and announces nothing. */
  quiet?: boolean | undefined
}

/**
 * ToolCall (07 §1.2, §1.6): running carries a light on its bottom edge, and every other state is an icon plus words.
 * Approval opens the card with editable arguments and a diff of the edit, takes focus and announces assertively. The
 * summary reads with its state ("run_tests, failed, exit 1"); settling confirms one sweep.
 */
export function ToolCall({ call, onApprove, onDeny, alwaysAllow, quiet }: ToolCallProps) {
  const id = uid('tool')
  const meta = derived(() => toolStatus(call))
  const st = derived(() => call.state)
  const args = state(untrack(() => call.args))
  const always = state(false)
  const diff = derived(() => argsDiff(call.args, args.value).join('\n'))
  const refs: {
    frame?: HTMLElement | undefined
    head?: HTMLElement | undefined
    ok?: HTMLElement | undefined
  } = {}
  toolLifecycle({ st, args, call: () => call, quiet: () => quiet, refs })
  const leave = toolLeave(refs)
  return (
    <div ref={(n) => (refs.frame = n)} data-part="tool-frame" data-sweep="">
      <Sweep />
      <details data-scope="tool-call" data-state={st.value} open={st.value === 'approval'}>
        <summary ref={(n) => (refs.head = n)}>
          <span>
            {st.value === 'running' && (
              <span
                data-scope="spinner"
                style="--_size:13px;color:var(--veneer-color-accent-text)"
              ></span>
            )}
            {st.value === 'done' && <CheckIcon style="color:var(--veneer-color-positive-text)" />}
            {st.value === 'approval' && <AlertIcon style="color:var(--veneer-color-caution-text)" />}
            {(st.value === 'failed' || st.value === 'denied') && (
              <XIcon style="color:var(--veneer-color-critical-text)" />
            )}
          </span>
          <span data-part="name">{call.name}</span>
          <span data-part="sr-only">{meta.value.word}</span>
          <span data-part="arg" aria-hidden="true">
            {call.args}
          </span>
          <span data-part="dur" data-numeric="">
            {meta.value.status}
          </span>
          <RightIcon data-part="chev" />
        </summary>
        <div data-part="io">
          <span>Input</span>
          <pre>{call.args}</pre>
          <span>Output</span>
          <pre>
            {call.output ??
              (st.value === 'approval'
                ? 'Waiting for approval'
                : st.value === 'denied'
                  ? 'Denied. Nothing was changed.'
                  : '…')}
          </pre>
        </div>
        {st.value === 'approval' && (
          <ToolApproval
            id={id}
            call={call}
            args={args}
            always={always}
            diff={diff}
            refs={refs}
            leave={leave}
            onApprove={() => onApprove?.(args.value, always.value)}
            onDeny={() => onDeny?.()}
            alwaysAllow={alwaysAllow}
          />
        )}
      </details>
    </div>
  )
}

function toolLeave(refs: { head?: HTMLElement | undefined }) {
  return (then: () => void) => {
    refs.head?.focus({ preventScroll: true })
    then()
  }
}

function toolLifecycle({
  st,
  args,
  call,
  quiet,
  refs,
}: {
  st: { readonly value: AgentTool['state'] }
  args: State<string>
  call: () => AgentTool
  quiet: () => boolean | undefined
  refs: { frame?: HTMLElement | undefined; ok?: HTMLElement | undefined }
}) {
  onMount(() => {
    const asked = () =>
      queueMicrotask(() => {
        refs.ok?.focus({ preventScroll: true })
        if (refs.frame)
          announce(
            refs.frame.ownerDocument,
            `The assistant wants to run ${untrack(() => call().name)}. Approve or deny.`,
            true,
          )
      })
    watch(
      () => st.value,
      (s, prev) => {
        if (s === 'approval') {
          args.value = untrack(() => call().args)
          if (prev !== undefined || !untrack(quiet)) asked()
        }
        if (prev !== undefined && s === 'done') {
          installSweep().confirm(refs.frame)
          announce(refs.frame!.ownerDocument, `${untrack(() => call().name)} finished.`)
        }
      },
    )
  })
}
function ToolApproval({
  id,
  call,
  args,
  always,
  diff,
  refs,
  leave,
  onApprove,
  onDeny,
  alwaysAllow,
}: {
  id: string
  call: AgentTool
  args: State<string>
  always: State<boolean>
  diff: { readonly value: string }
  refs: { ok?: HTMLElement | undefined }
  leave: (then: () => void) => void
  onApprove: () => void
  onDeny: () => void
  alwaysAllow?: string | undefined
}) {
  return (
    <div data-part="approve" role="group" aria-label={`Approve ${call.name}`}>
      <span data-part="eyebrow" id={`${id}-a`}>
        Arguments · editable
      </span>
      <textarea
        aria-labelledby={`${id}-a`}
        spellcheck="false"
        value={args.value}
        onInput={(e) => (args.value = e.currentTarget.value)}
      ></textarea>
      {diff.value && (
        <section data-part="io">
          <span>Your edit</span>
          <pre>{diff.value}</pre>
        </section>
      )}
      <div>
        <Button size="sm" ref={(n) => (refs.ok = n)} onClick={() => leave(() => onApprove())}>
          <CheckIcon />
          Approve
        </Button>
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => leave(() => onDeny())}>
          Deny
        </Button>
        {alwaysAllow !== undefined && (
          <Checkbox
            checked={always.value}
            onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
              (always.value = e.currentTarget.checked)
            }
          >
            {alwaysAllow}
          </Checkbox>
        )}
      </div>
    </div>
  )
}
