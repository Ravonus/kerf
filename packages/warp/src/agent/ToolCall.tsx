import { AlertIcon, CheckIcon, RightIcon, XIcon } from '@weft-js/warp-icons'
import { announce, argsDiff, installSweep, toolStatus, uid, type AgentTool } from '@weft-js/warp-core'
import { derived, onMount, state, untrack, watch } from '@weft-js/core'
import { Button } from '../Button'
import { Sweep } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/components/spinner.css'
import '@weft-js/warp-core/styles/app/tool-call.css'

export interface ToolCallProps {
  call: AgentTool
  /** Called with the arguments as edited, and whether "always allow" is ticked. Approval never auto-runs. */
  onApprove?: (args: string, always: boolean) => void
  onDeny?: () => void
  /** The "always allow" line, scoped to tool and resource: "Always allow edits in src/calendar". */
  alwaysAllow?: string
  /** Was there on load: takes no focus and announces nothing. */
  quiet?: boolean
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
  let frame: HTMLElement | undefined
  let head: HTMLElement | undefined
  let ok: HTMLElement | undefined
  onMount(() => {
    const asked = () => queueMicrotask(() => {
      ok?.focus({ preventScroll: true })
      if (frame) announce(frame.ownerDocument, `The assistant wants to run ${untrack(() => call.name)}. Approve or deny.`, true)
    })
    watch(() => st.value, (s, prev) => {
      if (s === 'approval') { args.value = untrack(() => call.args); if (prev !== undefined || !untrack(() => quiet)) asked() }
      if (prev !== undefined && s === 'done') {
        installSweep().confirm(frame)
        announce(frame!.ownerDocument, `${untrack(() => call.name)} finished.`)
      }
    })
  })
  const leave = (then: () => void) => { head?.focus({ preventScroll: true }); then() }
  return (
    <div ref={(n: any) => (frame = n)} data-part="tool-frame" data-sweep="">
      <Sweep />
      <details data-scope="tool-call" data-state={st.value} open={st.value === 'approval'}>
        <summary ref={(n: any) => (head = n)}>
          <span>
            {st.value === 'running' && <span data-scope="spinner" style="--_size:13px;color:var(--warp-color-accent-text)"></span>}
            {st.value === 'done' && <CheckIcon style="color:var(--warp-color-positive-text)" />}
            {st.value === 'approval' && <AlertIcon style="color:var(--warp-color-caution-text)" />}
            {(st.value === 'failed' || st.value === 'denied') && <XIcon style="color:var(--warp-color-critical-text)" />}
          </span>
          <span data-part="name">{call.name}</span>
          <span data-part="sr-only">{meta.value.word}</span>
          <span data-part="arg" aria-hidden="true">{call.args}</span>
          <span data-part="dur" data-numeric="">{meta.value.status}</span>
          <RightIcon data-part="chev" />
        </summary>
        <div data-part="io">
          <span>Input</span>
          <pre>{call.args}</pre>
          <span>Output</span>
          <pre>{call.output ?? (st.value === 'approval' ? 'Waiting for approval' : st.value === 'denied' ? 'Denied. Nothing was changed.' : '…')}</pre>
        </div>
        {st.value === 'approval' && (
          <div data-part="approve" role="group" aria-label={`Approve ${call.name}`}>
            <span data-part="eyebrow" id={`${id}-a`}>Arguments · editable</span>
            <textarea aria-labelledby={`${id}-a`} spellcheck="false" value={args.value} onInput={e => (args.value = (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
            {diff.value && <section data-part="io"><span>Your edit</span><pre>{diff.value}</pre></section>}
            <div>
              <Button size="sm" ref={(n: any) => (ok = n)} onClick={() => leave(() => onApprove?.(args.value, always.value))}><CheckIcon />Approve</Button>
              <Button emphasis="outline" tone="neutral" size="sm" onClick={() => leave(() => onDeny?.())}>Deny</Button>
              {alwaysAllow !== undefined && <label><input type="checkbox" checked={always.value} onChange={e => (always.value = (e.currentTarget as HTMLInputElement).checked)} /> {alwaysAllow}</label>}
            </div>
          </div>
        )}
      </details>
    </div>
  )
}
