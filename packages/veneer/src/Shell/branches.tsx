// The Shell's pre-existing conditional templates; their guards stay with the caller.
import { SearchIcon, DownIcon, MoreIcon } from '@kerf/veneer-icons'
import { sweepParts } from './shared'
import type { ShellView } from './state'

/** Render the existing brand branch. */
export function brand(view: ShellView) {
  return (
    <a
      href={view.props.brand!.href ?? '/'}
      data-part="brand"
      aria-label={`${view.props.brand!.name}, home`}
    >
      {view.props.brand!.mark}
      <span data-part="brand-name">{view.props.brand!.name}</span>
    </a>
  )
}

/** Render the existing command branch. */
export function command(view: ShellView) {
  return (
    <button
      type="button"
      data-part="command"
      data-sweep=""
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={view.props.command!.onOpen}
    >
      {sweepParts()}
      <SearchIcon />
      <span data-part="command-label">{view.props.command!.label ?? 'Search'}</span>
      <span data-part="command-hint">{view.props.command!.hint ?? 'Jump to, or run…'}</span>
      <kbd aria-hidden="true">{view.props.command!.shortcut ?? '⌘K'}</kbd>
    </button>
  )
}

/** Render the existing account trigger. */
export function accountButton(view: ShellView) {
  return (
    <button
      type="button"
      style="display:inline-grid;place-items:center;inline-size:var(--veneer-control-md);block-size:var(--veneer-control-md);border:0;background:none;padding:0;cursor:pointer;border-radius:var(--veneer-radius-round)"
      aria-haspopup="menu"
      aria-expanded={view.menuOpen.value ? 'true' : 'false'}
      aria-controls={view.menuId}
      onClick={(e: Event) => view.openMenu(e)}
      onKeyDown={view.menuKey}
    >
      <span data-scope="avatar" aria-hidden="true">
        {view.props.account!.initials}
      </span>
      <span data-part="sr-only">Account: {view.props.account!.name}</span>
    </button>
  )
}

/** Render the existing workspace trigger. */
export function switcherButton(view: ShellView) {
  return (
    <button
      type="button"
      data-part="switcher"
      data-sweep=""
      aria-haspopup="menu"
      aria-expanded={view.menuOpen.value ? 'true' : 'false'}
      aria-controls={view.menuId}
      onClick={(e: Event) => view.openMenu(e)}
      onKeyDown={view.menuKey}
    >
      {sweepParts()}
      <span data-scope="avatar" data-shape="square" data-size="sm" aria-hidden="true">
        {view.workspace.value?.initials}
      </span>
      <span data-part="sr-only">Workspace: </span>
      <span data-part="org">
        <b>{view.workspace.value?.name}</b>
        <small>{view.workspace.value?.meta}</small>
      </span>
      <span data-part="sr-only">. Switch workspace</span>
      <DownIcon />
    </button>
  )
}

/** Render the existing overflow trigger. */
export function navMore(view: ShellView) {
  return (
    <li data-tab="" data-part="nav-more">
      <button
        type="button"
        data-part="nav-item"
        data-sweep=""
        aria-haspopup="dialog"
        aria-expanded={view.moreOpen.value ? 'true' : 'false'}
        onClick={() => (view.moreOpen.value = true)}
      >
        <span data-part="icon">
          <MoreIcon />
          {sweepParts()}
        </span>
        <span data-part="nav-label">More</span>
      </button>
    </li>
  )
}
