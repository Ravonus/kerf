/** `{ role, name }` (name exact unless `exact: false`), `{ label }`, `{ text }`, or a snapshot ref `'@e12'`. */
export type Target =
  | string
  | { role: string; name?: string; exact?: boolean }
  | { label: string; exact?: boolean }
  | { text: string; exact?: boolean }

/** What `act` can do to an element. */
export type Action =
  | 'click'
  | 'dblclick'
  | 'hover'
  | 'focus'
  | 'clear'
  | 'fill'
  | 'type'
  | 'press'
  | 'select'
  | 'check'
  | 'uncheck'

/**
 * What an assertion checks, in @weft-js/core/test's words: `visible`, `absent`, `text` (contains), `exactText`, `value`,
 * `checked`, `unchecked`, `disabled`, `enabled`, `focused`, `count`.
 */
export type Expectation =
  | { visible: true }
  | { absent: true }
  | { text: string }
  | { exactText: string }
  | { value: string }
  | { checked: true }
  | { unchecked: true }
  | { disabled: true }
  | { enabled: true }
  | { focused: true }
  | { count: number }

export type Query =
  | { by: 'role'; role: string; name?: string | undefined }
  | { by: 'label'; label: string }
  | { by: 'text'; text: string }
  | { by: 'ref'; ref: string }
export type Step =
  | { kind: 'act'; target: Query; action: Action; value?: string | undefined }
  | { kind: 'assert'; target: Query | Target; expectation: Expectation }
  | { kind: 'clock'; op: 'install' | 'advance' | 'uninstall'; ms?: number }
  | { kind: 'net'; op: 'offline' | 'online' }
  | { kind: 'note'; text: string }

/** How `record.code` writes the steps it recorded. */
export interface CodeOptions {
  /** The component the test renders (default `App`), and where it comes from (default `./App`). */
  component?: string
  from?: string
  /** Props as source text (`{ api: createFakeApi() }`), and extra import lines they need. */
  props?: string
  imports?: string[]
  name?: string
}
