import { screen as dom } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { clock } from './clock'
import { flush } from './flush'

/**
 * Queries by what the user sees: role, label and text (`getBy*` throws, `queryBy*` returns null, `findBy*` waits).
 * There is no container, selector or test-id query (T005).
 */
export const screen = {
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByRole: dom.getByRole,
  getAllByRole: dom.getAllByRole,
  queryByRole: dom.queryByRole,
  queryAllByRole: dom.queryAllByRole,
  findByRole: dom.findByRole,
  findAllByRole: dom.findAllByRole /* oxlint-enable typescript/unbound-method */,
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByLabelText: dom.getByLabelText,
  getAllByLabelText: dom.getAllByLabelText,
  queryByLabelText: dom.queryByLabelText,
  queryAllByLabelText: dom.queryAllByLabelText,
  findByLabelText: dom.findByLabelText,
  findAllByLabelText: dom.findAllByLabelText /* oxlint-enable typescript/unbound-method */,
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByText: dom.getByText,
  getAllByText: dom.getAllByText,
  queryByText: dom.queryByText,
  queryAllByText: dom.queryAllByText,
  findByText: dom.findByText,
  findAllByText: dom.findAllByText /* oxlint-enable typescript/unbound-method */,
}

type UserEvent = ReturnType<typeof userEvent.setup>
type Actions = Pick<
  UserEvent,
  | 'click'
  | 'dblClick'
  | 'type'
  | 'clear'
  | 'keyboard'
  | 'hover'
  | 'unhover'
  | 'tab'
  | 'selectOptions'
  | 'deselectOptions'
  | 'upload'
  | 'paste'
>

let session: UserEvent | undefined
const act = <K extends keyof Actions>(name: K) =>
  (async (...args: unknown[]) => {
    session ??= userEvent.setup({
      advanceTimers: (ms) =>
        clock.installed ? vi.advanceTimersByTimeAsync(ms).then(() => {}) : undefined,
    })
    await (session[name] as (...a: unknown[]) => Promise<void>)(...args)
    await flush()
  }) as unknown as Actions[K]

/** User actions (`@testing-library/user-event`); each one ends in `flush()`, so there is nothing to wait for (T004). */
export const user: Actions = {
  click: act('click'),
  dblClick: act('dblClick'),
  type: act('type'),
  clear: act('clear'),
  keyboard: act('keyboard'),
  hover: act('hover'),
  unhover: act('unhover'),
  tab: act('tab'),
  selectOptions: act('selectOptions'),
  deselectOptions: act('deselectOptions'),
  upload: act('upload'),
  paste: act('paste'),
}

export function resetUser() {
  session = undefined
}
