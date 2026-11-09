import { AlertIcon, XIcon } from '@weft-js/warp-icons'
import { untrack } from '@weft-js/core'
import { Icon, type IconRef } from '../Icon'
import type { Field, Control } from '../Field'
type Value<T> = { readonly value: T }
type Model = {
  p: Parameters<typeof Field>[0]
  id: string
  shell: Parameters<Control>[0]
  live: Record<string, unknown>
  problem: Value<unknown>
  glyph: Value<IconRef | undefined>
  message: Value<boolean>
  msg: Value<string | undefined>
  chars: Value<{ c: string; at: number }[]>
  setRoot: (n: HTMLDivElement) => void
}

/** Render the field in its existing owner and original static template. */
export function fieldView({
  p,
  id,
  problem,
  glyph,
  message,
  msg,
  chars,
  live,
  shell,
  setRoot,
}: {
  p: Model['p']
  id: Model['id']
  problem: Model['problem']
  glyph: Model['glyph']
  message: Model['message']
  msg: Model['msg']
  chars: Model['chars']
  live: Model['live']
  shell: Model['shell']
  setRoot: Model['setRoot']
}) {
  return (
    <div
      ref={setRoot}
      data-scope="field"
      data-variant={p.variant}
      data-appearance={p.appearance}
      data-size={p.size === 'md' ? undefined : p.size}
      data-counter={p.counter}
      data-invalid={problem.value ? '' : undefined}
      data-disabled={live.disabled ? '' : undefined}
      data-readonly={live.readonly ? '' : undefined}
      {...p.attrs}
    >
      <div
        data-part="control"
        data-icon={typeof glyph.value === 'string' ? glyph.value : glyph.value ? '' : undefined}
        data-sweep=""
        data-filled={(p.filled ?? live.value) ? '' : undefined}
        data-hold={p.hold ? '' : undefined}
        data-wrap={p.wrap ? '' : undefined}
      >
        <span data-part="sweep-base" aria-hidden="true"></span>
        <span data-part="sweep" aria-hidden="true"></span>
        {glyph.value && fieldIcon(glyph)}
        <label
          data-part="label"
          for={p.group || p.labelled ? undefined : id}
          id={p.group || p.labelled ? `${id}-l` : undefined}
        >
          <span data-part="label-text">{p.label}</span>
          <span data-part="label-chars" aria-hidden="true">
            {chars.value.map((x) => (
              <span key={x.at} data-char data-c={x.c}></span>
            ))}
          </span>
        </label>
        {p.prefix !== undefined && <span data-part="prefix">{p.prefix}</span>}
        {p.group ? fieldBody({ p, id, msg, problem, shell }) : untrack(() => p.control(shell))}
        {p.suffix !== undefined && <span data-part="suffix">{p.suffix}</span>}
        {p.clearable && (
          <button type="button" data-part="clear" tabindex="-1" aria-label={`Clear ${p.label}`}>
            <XIcon />
          </button>
        )}
        {p.end}
      </div>
      {message.value && fieldMessage(p, msg, problem)}
    </div>
  )
}

function fieldIcon(glyph: Model['glyph']) {
  return (
    <span data-part="icon" aria-hidden="true">
      <span data-part="sweep-base">
        <Icon name={glyph.value!} />
      </span>
      <span data-part="sweep">
        <Icon name={glyph.value!} />
      </span>
    </span>
  )
}

function fieldBody({
  p,
  id,
  msg,
  problem,
  shell,
}: {
  p: Model['p']
  id: Model['id']
  msg: Model['msg']
  problem: Model['problem']
  shell: Model['shell']
}) {
  return (
    <div
      data-part="body"
      role="group"
      aria-labelledby={`${id}-l`}
      aria-describedby={msg.value}
      aria-invalid={problem.value ? 'true' : undefined}
    >
      {untrack(() => p.control(shell))}
    </div>
  )
}

function fieldMessage(p: Model['p'], msg: Model['msg'], problem: Model['problem']) {
  return (
    <div data-part="message" id={msg.value}>
      {problem.value ? (
        <span data-part="error" role="alert">
          <AlertIcon />
          <span>{problem.value}</span>
        </span>
      ) : (
        p.hint !== undefined && <span data-part="hint">{p.hint}</span>
      )}
      {p.counter !== undefined && <span data-part="counter" aria-live="off"></span>}
    </div>
  )
}
