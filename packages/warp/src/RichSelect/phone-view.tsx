import { DownIcon } from '@weft-js/warp-icons'
import { displayName, type E164, type PhoneCountry } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import {
  Hidden,
  Panel,
  type RichFieldProps,
  type bindable,
  type useOpen,
  type usePickerEnv,
} from '../Picker'
import type { Control } from '../Field'
import { SearchList } from './list'

export type PhoneView = {
  code: State<PhoneCountry>
  text: State<string>
  name: { readonly value: string }
  placeholder: { readonly value: string }
  value: ReturnType<typeof bindable<E164 | null>>
  pop: ReturnType<typeof useOpen>
  env: ReturnType<typeof usePickerEnv>
  list: PhoneCountry[]
  find(code?: string): PhoneCountry | undefined
  actions: {
    sync(raw: string, caret: number | null): void
    choose(c: PhoneCountry): void
    onBlur: () => void
    onPaste: (e: ClipboardEvent) => void
  }
  readonly: boolean | undefined
  disabled: boolean | undefined
  fieldName: string | undefined
  presentation: RichFieldProps['presentation']
  button: () => HTMLButtonElement
  setButton(n: HTMLButtonElement): void
  setInput(n: HTMLInputElement): void
}

export function PhoneControl({ view, p }: { view: PhoneView; p: Parameters<Control>[0] }) {
  return (
    <div data-part="body">
      <button
        ref={(n) => view.setButton(n)}
        type="button"
        data-part="country"
        aria-haspopup="dialog"
        aria-expanded={view.pop.value ? 'true' : 'false'}
        aria-disabled={view.readonly ? 'true' : undefined}
        disabled={view.disabled}
        onClick={() => {
          if (!view.readonly) view.pop.set(!view.pop.value)
        }}
      >
        <span aria-hidden="true">
          <b>{view.code.value.code}</b>+{view.code.value.dial}
        </span>
        <span class="sr">
          Country: {view.name.value}, +{view.code.value.dial}
        </span>
        <DownIcon />
      </button>
      <input
        ref={(n) => view.setInput(n)}
        data-part="input"
        id={p.id}
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        placeholder={view.placeholder.value}
        aria-describedby={p.describedby}
        value={view.text.value}
        required={p.rest.required}
        disabled={view.disabled}
        readonly={view.readonly}
        onInput={(e) => {
          const el = e.currentTarget
          view.actions.sync(el.value, el.selectionStart)
        }}
        onBlur={view.actions.onBlur}
        onPaste={view.actions.onPaste}
      />
      <Hidden name={view.fieldName} value={() => view.value.value ?? ''} />
    </div>
  )
}

export function PhonePanel({ view }: { view: PhoneView }) {
  return (
    <Panel label="Country" open={view.pop} trigger={view.button} presentation={view.presentation}>
      {() => (
        <SearchList
          label="Search countries"
          placeholder="Country or code"
          value={view.code.value.code}
          rows={() =>
            view.list.map((c) => {
              const main = displayName('region', c.code, view.env.locale.value)
              return {
                key: c.code,
                code: c.code,
                main,
                meta: `+${c.dial}`,
                search: `${main} ${c.code} ${c.dial}`.toLowerCase(),
              }
            })
          }
          match={(r, q) => r.search.includes(q.replace(/^\+/, ''))}
          onPick={(k) => view.actions.choose(view.find(k)!)}
        />
      )}
    </Panel>
  )
}
