import { AlertIcon, XIcon } from '@weft-js/warp-icons'
import { untrack } from '@weft-js/core'
import { Icon, type IconRef } from '../Icon'
import type { Control } from '../Field'

type Value<T> = { readonly value: T }
type Shell = Parameters<Control>[0]
type View = {
  label: string
  hint: unknown
  variant: string | undefined
  appearance: string | undefined
  size: string | undefined
  clearable: boolean | undefined
  counter: number | undefined
  prefix: unknown
  suffix: unknown
  end: unknown
  attrs: Record<string, unknown> | undefined
  group: boolean | undefined
  labelled: boolean | undefined
  filled: boolean | undefined
  hold: boolean | undefined
  wrap: boolean | undefined
  id: string
  shell: Shell
  live: Record<string, unknown>
  control: Control
  problem: Value<unknown>
  glyph: Value<IconRef | undefined>
  message: Value<boolean>
  msg: Value<string | undefined>
  chars: Value<{ c: string; at: number }[]>
  setRoot: (n: HTMLDivElement) => void
}

export function FieldView(props: View) {
  return (
    <div
      ref={props.setRoot}
      data-scope="field"
      data-variant={props.variant}
      data-appearance={props.appearance}
      data-size={props.size === 'md' ? undefined : props.size}
      data-counter={props.counter}
      data-invalid={props.problem.value ? '' : undefined}
      data-disabled={props.live.disabled ? '' : undefined}
      data-readonly={props.live.readonly ? '' : undefined}
      {...props.attrs}
    >
      <div
        data-part="control"
        data-icon={
          typeof props.glyph.value === 'string'
            ? props.glyph.value
            : props.glyph.value
              ? ''
              : undefined
        }
        data-sweep=""
        data-filled={(props.filled ?? props.live.value) ? '' : undefined}
        data-hold={props.hold ? '' : undefined}
        data-wrap={props.wrap ? '' : undefined}
      >
        <span data-part="sweep-base" aria-hidden="true"></span>
        <span data-part="sweep" aria-hidden="true"></span>
        {props.glyph.value && (
          <span data-part="icon" aria-hidden="true">
            <span data-part="sweep-base">
              <Icon name={props.glyph.value} />
            </span>
            <span data-part="sweep">
              <Icon name={props.glyph.value} />
            </span>
          </span>
        )}
        <FieldLabel
          label={props.label}
          id={props.id}
          group={props.group}
          labelled={props.labelled}
          chars={props.chars}
        />
        {props.prefix !== undefined && <span data-part="prefix">{props.prefix}</span>}
        {props.group ? (
          <div
            data-part="body"
            role="group"
            aria-labelledby={`${props.id}-l`}
            aria-describedby={props.msg.value}
            aria-invalid={props.problem.value ? 'true' : undefined}
          >
            {untrack(() => props.control(props.shell))}
          </div>
        ) : (
          untrack(() => props.control(props.shell))
        )}
        {props.suffix !== undefined && <span data-part="suffix">{props.suffix}</span>}
        {props.clearable && (
          <button type="button" data-part="clear" tabindex="-1" aria-label={`Clear ${props.label}`}>
            <XIcon />
          </button>
        )}
        {props.end}
      </div>
      <FieldMessage
        message={props.message}
        msg={props.msg}
        problem={props.problem}
        hint={props.hint}
        counter={props.counter}
      />
    </div>
  )
}

function FieldLabel({
  label,
  id,
  group,
  labelled,
  chars,
}: Pick<View, 'label' | 'id' | 'group' | 'labelled' | 'chars'>) {
  return (
    <label
      data-part="label"
      for={group || labelled ? undefined : id}
      id={group || labelled ? `${id}-l` : undefined}
    >
      <span data-part="label-text">{label}</span>
      <span data-part="label-chars" aria-hidden="true">
        {chars.value.map((x) => (
          <span key={x.at} data-char data-c={x.c}></span>
        ))}
      </span>
    </label>
  )
}

function FieldMessage({
  message,
  msg,
  problem,
  hint,
  counter,
}: Pick<View, 'message' | 'msg' | 'problem' | 'hint' | 'counter'>) {
  return (
    <>
      {message.value && (
        <div data-part="message" id={msg.value}>
          {problem.value ? (
            <span data-part="error" role="alert">
              <AlertIcon />
              <span>{problem.value}</span>
            </span>
          ) : (
            hint !== undefined && <span data-part="hint">{hint}</span>
          )}
          {counter !== undefined && <span data-part="counter" aria-live="off"></span>}
        </div>
      )}
    </>
  )
}
