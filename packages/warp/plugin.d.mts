// Theme schema digest: b1eaaae44fb9f57ad2e3d899eac6e2e7b24194e9ad8dd7a22f22e050c76721bb
import type { PluginInstance } from '@weft-js/core/plugin'

/** For `site.head`: restores `setDial(…, { persist: true })` before the first paint. */
export const dialScript: string

/** Explicit overrides; canonical sheet bindings remain under classification. */
export interface ThemeParts {
  button?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    highlight?: string
    gap?: number | string
    height?: number | string
    paddingInline?: number | string
    radius?: number | string
    font?: string | {
      family?: string
      size?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
    hover?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    focus?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    press?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
    disabled?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
      highlight?: string
    }
  }
  sweep?: {
    stroke?: string
    base?: string
    label?: string
    text?: string
    invalid?: {
      stroke?: string
      label?: string
      text?: string
    }
  }
  nav?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    gap?: number | string
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    active?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  tabs?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    active?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  link?: {
    text?: string
    underline?: string | { color?: string; width?: number | string; offset?: number | string }
    hover?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    focus?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    press?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      text?: string
      underline?: string | { color?: string; width?: number | string; offset?: number | string }
    }
  }
  pill?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    font?: string | {
      css?: string
    }
    hover?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    focus?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    active?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
    disabled?: {
      bg?: string
      text?: string
      border?: string | { color?: string; width?: number | string; style?: string }
    }
  }
  badge?: {
    bg?: string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    font?: string | {
      family?: string
      size?: number | string
      letterSpacing?: number | string
      transform?: string
    }
  }
  field?: {
    label?: string
    bg?: string
    floated?: {
      label?: string
    }
    hover?: {
      label?: string
      bg?: string
    }
    focus?: {
      label?: string
      bg?: string
      ring?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    invalid?: {
      label?: string
      bg?: string
      ring?: string | { color?: string; width?: number | string; offset?: number | string }
    }
    disabled?: {
      label?: string
      bg?: string
    }
    readonly?: {
      label?: string
      bg?: string
    }
  }
  focus?: {
    ring?: string | { color?: string; width?: number | string; offset?: number | string }
  }
  "text/display"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
  }
  "text/title"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
  }
  "text/heading"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
    }
  }
  "text/body"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
    }
  }
  "text/label"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
  }
  "text/caption"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
    }
  }
  "text/eyebrow"?: {
    font?: string | {
      family?: string
      size?: number | string
      lineHeight?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
  }
  "text/code"?: {
    font?: string | {
      family?: string
      size?: number | string
    }
  }
  "status-light"?: {
    font?: string | {
      size?: number | string
    }
  }
  avatar?: {
    width?: number | string
    height?: number | string
    radius?: number | string
    text?: string
    font?: string | {
      css?: string
    }
    shadow?: string
  }
  "event-card"?: {
    gap?: number | string
  }
  tile?: {
    radius?: number | string
    shadow?: string
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    text?: string
  }
  pip?: {
    radius?: number | string
    shadow?: string
  }
  "call-controls"?: {
    gap?: number | string
    padding?: number | string
  }
  notification?: {
    padding?: number | string
  }
  "push-ask"?: {
    padding?: number | string
    radius?: number | string
    shadow?: string
  }
  receipts?: {
    text?: string
  }
  typing?: {
    paddingInline?: number | string
    text?: string
  }
  composer?: {
    margin?: number | string
    radius?: number | string
  }
  suggest?: {
    radius?: number | string
    shadow?: string
  }
  cite?: {
    radius?: number | string
    shadow?: string
    font?: string | {
      css?: string
    }
    text?: string
  }
  "tool-call"?: {
    radius?: number | string
    shadow?: string
    font?: string | {
      size?: number | string
    }
  }
  cursor?: {
    text?: string
  }
  lock?: {
    radius?: number | string
    text?: string
    shadow?: string
  }
  sync?: {
    text?: string
  }
  reasoning?: {
    radius?: number | string
    font?: string | {
      size?: number | string
    }
  }
  branch?: {
    font?: string | {
      css?: string
    }
    text?: string
  }
  "context-meter"?: {
    font?: string | {
      css?: string
    }
    text?: string
  }
  trace?: {
    font?: string | {
      css?: string
    }
  }
  question?: {
    radius?: number | string
    shadow?: string
  }
  checkpoint?: {
    font?: string | {
      css?: string
    }
    text?: string
  }
  commit?: {
    radius?: number | string
    shadow?: string
  }
  "thread-replies"?: {
    text?: string
  }
  "comment-thread"?: {
    radius?: number | string
    shadow?: string
  }
  "follow-flag"?: {
    radius?: number | string
    text?: string
    font?: string | {
      css?: string
    }
  }
  "viewport-rail"?: {
    radius?: number | string
    shadow?: string
  }
  "click-ripple"?: {
    shadow?: string
  }
  artifact?: {
    radius?: number | string
    shadow?: string
  }
  availability?: {
    gap?: number | string
  }
  "auto-track"?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  year?: {
    gap?: number | string
  }
  "prefs-matrix"?: {
    gap?: number | string
  }
  transport?: {
    gap?: number | string
  }
  message?: {
    radius?: number | string
  }
  "system-page"?: {
    padding?: number | string
  }
  "button-group"?: {
    gap?: number | string
  }
  toggle?: {
    gap?: number | string
    height?: number | string
    minWidth?: number | string
    paddingInline?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    text?: string
    font?: string | {
      css?: string
    }
  }
  "toggle-group"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  chip?: {
    gap?: number | string
    height?: number | string
    paddingInline?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    text?: string
    font?: string | {
      css?: string
      size?: number | string
    }
  }
  surface?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
    text?: string
    font?: string | {
      lineHeight?: number | string
    }
  }
  fab?: {
    insetBlockEnd?: number | string
    insetInlineEnd?: number | string
    gap?: number | string
    radius?: number | string
    text?: string
    font?: string | {
      family?: string
      size?: number | string
      weight?: number | string
      letterSpacing?: number | string
      transform?: string
    }
    shadow?: string
  }
  alert?: {
    gap?: number | string
    padding?: number | string
    paddingInlineEnd?: number | string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  banner?: {
    gap?: number | string
    padding?: number | string
    text?: string
    font?: string | {
      size?: number | string
    }
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  callout?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
  }
  spinner?: {
    width?: number | string
    height?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  skeleton?: {
    radius?: number | string
  }
  "empty-state"?: {
    gap?: number | string
    padding?: number | string
  }
  "status-dot"?: {
    shadow?: string
  }
  "live-status"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    text?: string
    font?: string | {
      css?: string
    }
  }
  toolbar?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  logo?: {
    text?: string
  }
  tag?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    text?: string
    font?: string | {
      size?: number | string
    }
  }
  image?: {
    radius?: number | string
  }
  item?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
  }
  "section-message"?: {
    padding?: number | string
    text?: string
  }
  menubar?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  "selection-toolbar"?: {
    radius?: number | string
    text?: string
    shadow?: string
  }
  "ai-label"?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    text?: string
    font?: string | {
      css?: string
    }
  }
  qr?: {
    gap?: number | string
  }
  panel?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
    shadow?: string
  }
  table?: {
    gap?: number | string
  }
  delta?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  "stat-row"?: {
    gap?: number | string
  }
  stat?: {
    padding?: number | string
    radius?: number | string
  }
  chart?: {
    gap?: number | string
  }
  list?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  tree?: {
    font?: string | {
      size?: number | string
    }
  }
  "card-grid"?: {
    gap?: number | string
  }
  card?: {
    padding?: number | string
    radius?: number | string
    shadow?: string
  }
  kanban?: {
    gap?: number | string
  }
  virtual?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  "scroll-grid"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    font?: string | {
      size?: number | string
    }
  }
  pagination?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  "load-more"?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  "bar-list"?: {
    font?: string | {
      size?: number | string
    }
  }
  map?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  flow?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  sso?: {
    gap?: number | string
  }
  gate?: {
    radius?: number | string
  }
  checklist?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  "setting-row"?: {
    gap?: number | string
  }
  "save-bar"?: {
    gap?: number | string
    radius?: number | string
    text?: string
    shadow?: string
    font?: string | {
      size?: number | string
    }
  }
  confirm?: {
    gap?: number | string
  }
  plans?: {
    gap?: number | string
  }
  "plan-card"?: {
    radius?: number | string
  }
  lines?: {
    font?: string | {
      size?: number | string
    }
  }
  conn?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  qty?: {
    height?: number | string
    radius?: number | string
    shadow?: string
  }
  "pay-frame"?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  confirmation?: {
    gap?: number | string
  }
  shortcuts?: {
    gap?: number | string
  }
  "bulk-bar"?: {
    gap?: number | string
    radius?: number | string
    text?: string
    font?: string | {
      size?: number | string
    }
  }
  integrations?: {
    gap?: number | string
  }
  integration?: {
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  calendar?: {
    gap?: number | string
  }
  "range-panel"?: {
    gap?: number | string
  }
  wheels?: {
    gap?: number | string
    height?: number | string
  }
  rte?: {
    gap?: number | string
  }
  kv?: {
    gap?: number | string
  }
  "md-editor"?: {
    gap?: number | string
  }
  code?: {
    font?: string | {
      css?: string
    }
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  codeblock?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  markdown?: {
    font?: string | {
      size?: number | string
    }
  }
  prose?: {
    font?: string | {
      size?: number | string
      lineHeight?: number | string
    }
  }
  snippet?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    font?: string | {
      css?: string
    }
  }
  jsontree?: {
    font?: string | {
      css?: string
    }
    radius?: number | string
  }
  diff?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  tests?: {
    font?: string | {
      size?: number | string
    }
  }
  props?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  linkcard?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  embed?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  strength?: {
    font?: string | {
      size?: number | string
    }
  }
  quantity?: {
    height?: number | string
    radius?: number | string
  }
  otp?: {
    gap?: number | string
  }
  editable?: {
    gap?: number | string
    minHeight?: number | string
  }
  group?: {
    gap?: number | string
  }
  "choice-card"?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
  }
  segmented?: {
    radius?: number | string
    shadow?: string
  }
  popup?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
    font?: string | {
      family?: string
    }
  }
  transfer?: {
    gap?: number | string
  }
  slider?: {
    height?: number | string
  }
  "range-head"?: {
    gap?: number | string
  }
  color?: {
    gap?: number | string
  }
  dropzone?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
    text?: string
  }
  cropper?: {
    radius?: number | string
  }
  form?: {
    gap?: number | string
  }
  "error-summary"?: {
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    text?: string
  }
  setting?: {
    gap?: number | string
    paddingBlock?: number | string
  }
  rules?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  "knob-row"?: {
    gap?: number | string
  }
  "xy-pad"?: {
    radius?: number | string
  }
  gradient?: {
    gap?: number | string
  }
  "icon-tile"?: {
    radius?: number | string
  }
  "hover-scope"?: {
    gap?: number | string
    radius?: number | string
  }
  autosave?: {
    font?: string | {
      size?: number | string
    }
    text?: string
  }
  stack?: {
    gap?: number | string
  }
  row?: {
    gap?: number | string
  }
  grid?: {
    gap?: number | string
  }
  split?: {
    gap?: number | string
  }
  center?: {
    maxWidth?: number | string
  }
  cover?: {
    gap?: number | string
    minHeight?: number | string
    paddingBlock?: number | string
  }
  "master-detail"?: {
    height?: number | string
    insetBlockStart?: number | string
  }
  section?: {
    gap?: number | string
    paddingBlock?: number | string
  }
  "page-header"?: {
    gap?: number | string
  }
  masonry?: {
    columnGap?: number | string
    gap?: number | string
  }
  "split-pane"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  "float-panel"?: {
    insetBlockStart?: number | string
    insetInlineStart?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
    inset?: number | string
    paddingBlockEnd?: number | string
  }
  navlist?: {
    gap?: number | string
  }
  sidenav?: {
    font?: string | {
      size?: number | string
    }
    insetBlockStart?: number | string
  }
  docs?: {
    minHeight?: number | string
  }
  "anchor-nav"?: {
    font?: string | {
      size?: number | string
    }
  }
  topnav?: {
    gap?: number | string
    minHeight?: number | string
    padding?: number | string
  }
  "sticky-bar"?: {
    insetBlockEnd?: number | string
    gap?: number | string
    padding?: number | string
  }
  announcement?: {
    gap?: number | string
    padding?: number | string
    text?: string
    font?: string | {
      size?: number | string
    }
  }
  consent?: {
    insetInlineStart?: number | string
    insetBlockEnd?: number | string
    width?: number | string
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
    paddingBlockEnd?: number | string
  }
  "doc-tabs"?: {
    paddingInline?: number | string
  }
  "status-bar"?: {
    paddingInline?: number | string
    paddingBlockEnd?: number | string
    font?: string | {
      css?: string
    }
    text?: string
  }
  board?: {
    gap?: number | string
  }
  canvas?: {
    backgroundImage?: string
  }
  "back-to-top"?: {
    insetBlockEnd?: number | string
    marginInlineEnd?: number | string
    width?: number | string
    height?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    shadow?: string
    text?: string
  }
  pager?: {
    gap?: number | string
    marginBlockStart?: number | string
  }
  inset?: {
    padding?: number | string
    radius?: number | string
  }
  landing?: {
    text?: string
  }
  block?: {
    paddingBlock?: number | string
    paddingInline?: number | string
  }
  announce?: {
    gap?: number | string
    padding?: number | string
    text?: string
    font?: string | {
      size?: number | string
    }
  }
  topbar?: {
    gap?: number | string
    paddingInline?: number | string
  }
  hero?: {
    padding?: number | string
  }
  mock?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    shadow?: string
  }
  logos?: {
    gap?: number | string
  }
  marquee?: {
    gap?: number | string
  }
  stats?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  bento?: {
    gap?: number | string
  }
  story?: {
    gap?: number | string
  }
  carousel?: {
    gap?: number | string
  }
  quote?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  gallery?: {
    gap?: number | string
  }
  "selection-bar"?: {
    insetBlockStart?: number | string
    gap?: number | string
    marginBlockEnd?: number | string
    minHeight?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  compare?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  pricing?: {
    gap?: number | string
  }
  plan?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  "compare-table"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  product?: {
    gap?: number | string
  }
  zoom?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  thumbs?: {
    gap?: number | string
  }
  variant?: {
    gap?: number | string
  }
  lobby?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  facts?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
  }
  cta?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
    text?: string
  }
  newsletter?: {
    gap?: number | string
  }
  footer?: {
    padding?: number | string
  }
  scene?: {
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
  "live-room"?: {
    gap?: number | string
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  "event-log"?: {
    font?: string | {
      css?: string
    }
    text?: string
  }
  "stat-strip"?: {
    margin?: number | string
  }
  market?: {
    gap?: number | string
  }
  listing?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  "player-notes"?: {
    gap?: number | string
    marginBlockStart?: number | string
  }
  transcript?: {
    marginBlockStart?: number | string
    paddingBlockStart?: number | string
  }
  reviews?: {
    gap?: number | string
    marginBlockStart?: number | string
  }
  review?: {
    gap?: number | string
    paddingBlock?: number | string
  }
  backdrops?: {
    gap?: number | string
  }
  backdrop?: {
    padding?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  "scroll-progress"?: {
    inset?: number | string
    height?: number | string
  }
  "container-scroll"?: {
    gap?: number | string
  }
  "fancy-stage"?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
  }
  "fancy-presets"?: {
    gap?: number | string
  }
  "motion-cards"?: {
    gap?: number | string
  }
  "motion-card"?: {
    gap?: number | string
    padding?: number | string
    text?: string
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  wall?: {
    gap?: number | string
  }
  team?: {
    gap?: number | string
  }
  blog?: {
    gap?: number | string
  }
  post?: {
    border?: string | { color?: string; width?: number | string; style?: string }
    radius?: number | string
    shadow?: string
  }
  "blog-foot"?: {
    marginBlockStart?: number | string
  }
  contact?: {
    gap?: number | string
  }
  waitlist?: {
    gap?: number | string
    padding?: number | string
    radius?: number | string
    border?: string | { color?: string; width?: number | string; style?: string }
  }
}

/** A system density stop. */
export interface ThemeDensity { factor?: number; control?: { sm?: number | string; md?: number | string; lg?: number | string } }
/** A custom text role. */
export interface ThemeTextRole { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }
/** System scale types; bindings remain under classification. */
export interface ThemeSystem {
  space?: Record<string, number | string>
  radius?: Record<string, number | string>
  font?: Record<string, string>
  shadow?: Record<string, string>
  border?: { hairline?: number | string; emphasis?: number | string }
  padding?: { control?: number | string; surface?: number | string }
  control?: { sm?: number | string; md?: number | string; lg?: number | string }
  field?: { height?: number | string }
  layout?: { bar?: number | string; tabbar?: number | string; rail?: number | string; sidebar?: number | string; list?: number | string; aside?: number | string; measure?: number | string; narrow?: number | string; content?: number | string; wide?: number | string }
  focus?: { width?: number | string; offset?: number | string; color?: string }
  density?: { compact?: ThemeDensity; cozy?: ThemeDensity; comfortable?: ThemeDensity }
  motion?: { scale?: number; press?: number; stagger?: number | string; staggerMax?: number; distance?: number | string; scaleFrom?: number; duration?: { arrive?: number | string; base?: number | string; "exit-k"?: number | string; fast?: number | string; fill?: number | string; frame?: number | string; instant?: number | string; "label-char"?: number | string; "label-float"?: number | string; message?: number | string; push?: number | string; route?: number | string; sheet?: number | string; slow?: number | string; spring?: number | string; sweep?: number | string }; easing?: { in?: string; "in-out"?: string; "label-float"?: string; out?: string; pop?: string; sheet?: string; spring?: string; sweep?: string; "sweep-in"?: string } }
  color?: { "accent-border"?: string; "accent-on-solid"?: string; "accent-soft"?: string; "accent-solid"?: string; "accent-solid-hover"?: string; "accent-text"?: string; border?: string; "border-control"?: string; "border-strong"?: string; "caution-border"?: string; "caution-on-solid"?: string; "caution-soft"?: string; "caution-solid"?: string; "caution-solid-hover"?: string; "caution-text"?: string; "critical-border"?: string; "critical-on-solid"?: string; "critical-soft"?: string; "critical-solid"?: string; "critical-solid-hover"?: string; "critical-text"?: string; "data-1"?: string; "data-2"?: string; "data-3"?: string; "data-4"?: string; "data-5"?: string; "data-6"?: string; "data-7"?: string; "data-8"?: string; "data-axis"?: string; "data-div-mid"?: string; "data-div-neg"?: string; "data-div-pos"?: string; "data-down"?: string; "data-down-flash"?: string; "data-grid"?: string; "data-other"?: string; "data-seq-0"?: string; "data-seq-1"?: string; "data-seq-2"?: string; "data-seq-3"?: string; "data-seq-4"?: string; "data-seq-5"?: string; "data-up"?: string; "data-up-flash"?: string; field?: string; "field-active"?: string; "field-invalid"?: string; focus?: string; "highlight-border"?: string; "highlight-on-solid"?: string; "highlight-soft"?: string; "highlight-solid"?: string; "highlight-solid-hover"?: string; "highlight-text"?: string; "info-border"?: string; "info-on-solid"?: string; "info-soft"?: string; "info-solid"?: string; "info-solid-hover"?: string; "info-text"?: string; label?: string; "label-active"?: string; "label-rest"?: string; "neutral-border"?: string; "neutral-on-solid"?: string; "neutral-soft"?: string; "neutral-solid"?: string; "neutral-solid-hover"?: string; "neutral-text"?: string; "on-inverse"?: string; page?: string; "positive-border"?: string; "positive-on-solid"?: string; "positive-soft"?: string; "positive-solid"?: string; "positive-solid-hover"?: string; "positive-text"?: string; "primary-on-solid"?: string; "primary-solid"?: string; "primary-solid-hover"?: string; scrim?: string; surface?: string; "surface-active"?: string; "surface-hover"?: string; "surface-inverse"?: string; "surface-line"?: string; "surface-overlay"?: string; "surface-raised"?: string; "surface-sunken"?: string; sweep?: string; "sweep-base"?: string; "sweep-critical"?: string; text?: string; "text-faint"?: string; "text-subtle"?: string }
  text?: Record<string, ThemeTextRole | undefined> & {
    display?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    title?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    heading?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string }
    body?: { family?: string; size?: number | string; lineHeight?: number | string }
    label?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }
    caption?: { family?: string; size?: number | string; lineHeight?: number | string }
    eyebrow?: { family?: string; size?: number | string; lineHeight?: number | string; weight?: number | string; letterSpacing?: number | string; transform?: string }
    code?: { family?: string; size?: number | string }
  }
}

/** What `warp()` takes in weft.config: the seed, the default dials, radius, fonts and any token. */
export interface WarpOptions {
  /** Type and space scales from the classified shim consumers. */
  system?: ThemeSystem
  /** Part overrides from the explicit theme table. */
  parts?: ThemeParts
  /**
   * The brand's hue family: `{ accent: '#rrggbb' }`, or a hue and chroma. Each theme solves its own lightness, and the build
   * prints where it landed. `neutral` tints pages, surfaces and text the same way. Checked at the stops `dials` leave (D010).
   */
  seed?: ({ accent: string } | { hue: number; chroma: number } | {}) & {
    neutral?: string | { hue: number; chroma: number }
  }
  /** `'classic'` makes classic fields the default. */
  fields?: 'floating' | 'classic'
  /** The app's default dials. A `data-*` on `<html>` or any scope still wins. */
  dials?: {
    expression?: 'quiet' | 'balanced' | 'vivid'
    density?: 'compact' | 'cozy' | 'comfortable'
    flair?: 'sweep' | 'none'
    theme?: 'light' | 'dark'
  }
  /** Replaces the radius each expression sets. */
  radius?: 'sharp' | 'soft' | 'round'
  /** A family name, or a full CSS font stack. */
  fonts?: { body?: string; display?: string; mono?: string }
  /** Any spec token, like `{ '--warp-color-page': '#fafafa' }`. Checked at the stops `dials` leave (D010). */
  tokens?: Record<`--warp-${string}`, string>
}

/** The Vite plugin that serves warp's tokens for an app. */
export const warp: (options?: WarpOptions) => PluginInstance<unknown>
/** The plugin, for `import warp from`. */
export default warp
