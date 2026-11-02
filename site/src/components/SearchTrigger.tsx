import { Button, Kbd } from '@weft-js/warp'
import { warmBody } from '../lib/search'
import { spotlightOpen } from '../lib/spotlight'

/** Opens the spotlight: a warp button dressed as the search field it opens, with its shortcut. */
export function SearchTrigger() {
  return (
    <>
      <Button data-site="search" emphasis="outline" tone="neutral" size="sm" icon="search" onClick={() => (spotlightOpen.value = true)} onPointerEnter={warmBody} onFocus={warmBody} aria-keyshortcuts="Meta+K Control+K">
        <span data-part="text">Search</span>
        <span data-part="keys"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </Button>
    </>
  )
}
