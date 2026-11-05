import { RightIcon, XIcon, LeftIcon, PanelIcon, CheckIcon } from '@weft-js/warp-icons'
import { Crumbs, Item, Entry, draw } from './shared'
import type { ShellView } from './state'
import { button } from './button'
import { brand, command, accountButton, switcherButton, navMore } from './branches'

/** Render the shell in its original owner. */
export function shellFrame(view: ShellView, page: unknown) {
  return (
    <div
      ref={(n) => (view.refs.root = n)}
      data-scope="shell"
      data-part="root"
      data-variant={view.focus.value ? 'focus' : undefined}
      data-depth={view.props.depth}
      data-collapsed={
        view.folded.value === 'hidden' ? 'hidden' : view.folded.value ? '' : undefined
      }
      data-nav-open={view.navOpen.value ? '' : undefined}
    >
      <a data-part="skip" href={`#${view.main}`}>
        Skip to content
      </a>
      {view.folded.value === 'hidden' && (
        <button
          type="button"
          data-part="edge-tab"
          aria-controls={view.navId}
          aria-expanded={view.navOpen.value ? 'true' : 'false'}
          aria-label={view.navOpen.value ? 'Hide navigation' : 'Show navigation'}
          onClick={() => (view.navOpen.value = !view.navOpen.value)}
        >
          <RightIcon />
        </button>
      )}
      <div data-part="layout">
        <header data-part="header">
          {view.focus.value && view.props.close && button(view.props.close, undefined, XIcon)}
          {!view.focus.value && view.props.back && button(view.props.back, 'back', LeftIcon)}
          {!view.focus.value && view.props.brand && brand(view)}
          {view.props.title !== undefined && <p data-part="title">{view.props.title}</p>}
          {!view.focus.value && view.props.crumbs && <Crumbs items={view.props.crumbs} />}
          <div data-part="actions">
            {view.focus.value && view.props.step !== undefined && (
              <span style="white-space:nowrap;font-size:var(--warp-text-caption-size);color:var(--warp-color-text-subtle)">
                {view.props.step}
              </span>
            )}
            {!view.focus.value && view.props.command && command(view)}
            {!view.focus.value && view.props.actions}
            {!view.focus.value && view.props.account && accountButton(view)}
          </div>
        </header>
        {!view.focus.value && shellNav(view)}
        {view.props.island ? islandMain(view, page) : standardMain(view, page)}
      </div>
      <div
        data-part="scrim"
        data-for="nav"
        hidden={!view.navOpen.value}
        onClick={view.closeNav}
      ></div>
      {!view.focus.value && view.props.account && shellAccount(view)}
      {!view.focus.value && shellMore(view)}
      <div data-scope="announcer" role="status" aria-live="polite"></div>
      {view.props.overlays}
    </div>
  )
}

function shellNav(view: ShellView) {
  return (
    <nav
      data-part="nav"
      aria-label={view.navLabel}
      id={view.navId}
      onClick={(e: MouseEvent) => {
        if ((e.target as Element).closest?.('a')) view.closeNav()
      }}
    >
      {view.groups.value[0]?.label !== undefined && (
        <p data-part="nav-group" id={`${view.navId}-g`}>
          {view.groups.value[0].label}
        </p>
      )}
      {view.props.switcher && switcherButton(view)}
      <ul
        data-part="nav-list"
        aria-labelledby={view.groups.value[0]?.label !== undefined ? `${view.navId}-g` : undefined}
      >
        {view.primary.value.map((p) => (
          <li key={p.item.id} data-tab={p.tab ? '' : undefined}>
            <Item item={p.item} current={view.props.current} onPick={view.closeNav} />
          </li>
        ))}
        {view.more.value.length > 0 && navMore(view)}
      </ul>
      {view.extra.value.length > 0 && shellNavExtra(view)}
      <div data-part="nav-foot">
        {view.props.foot?.map((i) => (
          <Item key={i.id} item={i} current={view.props.current} onPick={view.closeNav} />
        ))}
        <button
          type="button"
          data-part="nav-toggle"
          aria-controls={view.navId}
          aria-expanded={view.toggleExpanded.value ? 'true' : 'false'}
          aria-label={view.toggleLabel.value}
          aria-keyshortcuts="["
          onClick={view.toggle}
        >
          <PanelIcon />
        </button>
      </div>
    </nav>
  )
}

function shellNavExtra(view: ShellView) {
  return (
    <div data-part="nav-extra">
      {view.extra.value.map((g) => (
        <div key={g.label}>
          <p data-part="nav-group">{g.label}</p>
          <ul data-part="nav-list" aria-label={g.label}>
            {g.items.map((i) => (
              <li key={i.id}>
                <Item item={i} current={view.props.current} plain onPick={view.closeNav} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function shellAccount(view: ShellView) {
  return (
    <aside aria-label="Account" hidden={!view.menuOpen.value}>
      <div
        ref={(n) => (view.refs.menuEl = n)}
        data-scope="menu"
        data-part="menu"
        role="menu"
        id={view.menuId}
        aria-label={`Account: ${view.props.account!.name}${view.props.account!.email ? `, ${view.props.account!.email}` : ''}`}
        hidden={!view.menuOpen.value}
      >
        <div aria-hidden="true" style="display:flex;gap:10px;align-items:center;padding:10px">
          <span data-scope="avatar">{view.props.account!.initials}</span>
          <div>
            <b style="display:block;font-weight:600">{view.props.account!.name}</b>
            <span style="font-size:var(--warp-text-caption-size);color:var(--warp-color-text-subtle)">
              {view.props.account!.email}
            </span>
          </div>
        </div>
        {view.props.switcher && (
          <>
            <div data-part="separator" role="separator"></div>
            <div role="group" aria-label="Workspace">
              <p data-part="group-label" aria-hidden="true" style="margin:0">
                Workspace
              </p>
              {view.props.switcher.workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  data-part="item"
                  role="menuitemradio"
                  tabindex="-1"
                  aria-checked={w.id === view.props.switcher!.current ? 'true' : 'false'}
                  style="inline-size:100%;border:0;background:none;font:inherit;text-align:start"
                  onClick={() => {
                    view.props.switcher!.onSwitch(w.id)
                    view.shut()
                    view.refs.from?.focus()
                  }}
                >
                  <span data-scope="avatar" data-shape="square" data-size="sm" aria-hidden="true">
                    {w.initials}
                  </span>
                  <span data-part="item-label">{w.name}</span>
                  <span data-part="indicator">
                    <CheckIcon />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {view.entries.value.map((x) => (
          <Entry
            key={x.at}
            entry={x.entry}
            onPick={() => {
              view.shut()
              view.refs.from?.focus()
            }}
          />
        ))}
      </div>
    </aside>
  )
}

function shellMore(view: ShellView) {
  return (
    <dialog
      ref={(n) => (view.refs.sheetEl = n)}
      data-part="sheet"
      aria-labelledby={view.sheetId}
      hidden={!view.moreOpen.value}
      style="margin:0;max-inline-size:none"
    >
      <div style="display:flex;align-items:center;justify-content:space-between">
        <p data-part="title" id={view.sheetId} style="margin:0;font-weight:600">
          More
        </p>
        <button
          type="button"
          data-scope="button"
          data-emphasis="ghost"
          data-tone="neutral"
          data-icon-only=""
          aria-label="Close"
          data-close=""
          autofocus
        >
          <XIcon />
        </button>
      </div>
      <div data-scope="menu">
        {view.more.value.map((i) => (
          <a
            key={i.id}
            data-part="item"
            style="text-decoration:none"
            href={i.href ?? '#'}
            aria-current={view.props.current === i.id ? 'page' : undefined}
            onClick={(e: MouseEvent) => {
              if (!i.href) e.preventDefault()
              i.onSelect?.()
              view.moreOpen.value = false
            }}
          >
            {draw(i.icon)}
            <span data-part="item-label">{i.label}</span>
            {i.count !== undefined && <span data-part="shortcut">{i.count}</span>}
          </a>
        ))}
      </div>
    </dialog>
  )
}

function islandMain(view: ShellView, page: unknown) {
  return (
    <div
      data-part="main"
      id={view.main}
      tabindex="-1"
      role="region"
      aria-label={view.props.label ?? 'Page content'}
    >
      {page}
      {view.props.dock !== undefined && <div data-part="dock">{view.props.dock}</div>}
    </div>
  )
}

function standardMain(view: ShellView, page: unknown) {
  return (
    <main data-part="main" id={view.main} tabindex="-1">
      {page}
      {view.props.dock !== undefined && <div data-part="dock">{view.props.dock}</div>}
    </main>
  )
}
