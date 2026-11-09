import { Button } from '@weft-js/warp'
import { warmBody } from '../lib/search'
import { spotlightOpen } from '../lib/spotlight'

/** The shortcut as this keyboard writes it: ⌘K on a Mac, Ctrl K elsewhere. */
const keys = (n: HTMLElement | null) => {
  if (n && !/Mac|iPhone|iPad/.test(navigator.platform)) n.textContent = 'Ctrl K'
}

/**
 * Opens the spotlight: a Warp button dressed as a quiet search field. Its shortcut stays out of the way until the
 * hand or the keyboard comes to it.
 */
export function SearchTrigger() {
  return (
    <>
      <Button
        data-site="search"
        emphasis="outline"
        tone="neutral"
        size="sm"
        icon="search"
        collapse="tablet"
        onClick={() => (spotlightOpen.value = true)}
        onPointerEnter={warmBody}
        onFocus={warmBody}
        aria-keyshortcuts="Meta+K Control+K"
      >
        <span data-part="text">Search</span>
        <kbd data-part="keys" aria-hidden="true" ref={keys}>
          ⌘K
        </kbd>
      </Button>
    </>
  )
}
