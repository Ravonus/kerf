// The list of a Select (APG select-only combobox; docs/design/veneer/redesign.md §5): veneer's panel on every device. Focus
// stays on the trigger and aria-activedescendant names the active row; a long list adds a search input, which then holds
// focus the same way. A phone gets a modal sheet instead, where focus moves onto the rows, since mobile screen readers
// follow aria-activedescendant unreliably. The panel is built on first open and kept, so a page of closed selects costs
// a button each.
import type { Presentation } from './picker'
import type { ChangeReason } from './temporal'
import { ListboxAction } from './listbox/action'

/** One row of a listbox. */
export type ListItem = {
  value: string
  label: string
  disabled?: boolean | undefined
  hint?: string | undefined
  group?: string | undefined
}

/** Options for `listbox`. */
export interface ListboxOptions {
  /** Given, it holds the list open or shut; left out, the list answers to the keys and presses alone. */
  open?: boolean | undefined
  label: string
  items: ListItem[]
  value: string
  presentation?: Presentation | undefined
  /** A search input over the rows. */
  search?: boolean | undefined
  /** Rows toggle instead of choosing one: a pick doesn't close the list, and `values` are the ones on. */
  multiple?: boolean | undefined
  /** With `multiple`, the values that are on. */
  values?: readonly string[] | undefined
  onPick(value: string, reason: ChangeReason): void
  onOpenChange?(open: boolean): void
}

/** The select's listbox, attached to its trigger: keys, typeahead, search, groups, and a sheet on a phone. */
export function listbox(trigger: HTMLButtonElement, opts: ListboxOptions) {
  const action = new ListboxAction(trigger, opts)
  return {
    update(next: ListboxOptions) {
      action.update(next)
    },
    destroy() {
      action.destroy()
    },
  }
}
