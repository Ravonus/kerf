# warp coverage: everything the original had, and more

The user's requirement: warp handles **any use case**. Every component the original kit shipped must have a warp
equivalent, rebuilt rather than dropped. The research doc's "move out / drop" verdicts are overridden. Things can
live in optional packs, but they must be designed.

The source is `~/dev/agorix-discord/packages/ui/src/components`, plus the sandbox showcase in
`packages/ui/sandbox/src/pages`. Each row below names the spec that owns it. An owner marks a row done by giving it a
section in their spec and a demo in their specimen. The Status column records it as ✓ done, ◐ partial (naming what is
missing) or ✗ missing, linking the spec section and the specimen element id that exists at runtime; P2 rows stay
blank until audited, and §4 lists what is left. A coverage researcher appends anything missing from other major
kits in §2.

**Owners:**

| Short name | Spec file |
|---|---|
| inputs | `03-inputs.md` |
| rich | `04-inputs-rich.md` |
| comp | `05-components.md` |
| data | `06-data-and-charts.md` |
| layout | `02-layout.md` |
| app | `07-app-patterns.md` |
| market | `08-marketing-and-expressive.md` |

## 1. Original inventory → owner

| Original folder | Components | Owner | Status |
|---|---|---|---|
| buttons | Button, ButtonGroup, Toolbar, AnimatedHamburger | comp | ✓ [05 §2](05-components.md#2-actions) · [components#actions](specimens/components.html#actions) |
| carousel | Carousel (all modes) | market | ✓ [08 §5.1](08-marketing-and-expressive.md#51-carousel-oldcarousel-all-modes-kept) · [marketing#quotes](specimens/marketing.html#quotes) |
| charts | LineChart, BarChart, DonutChart, GaugeChart, HeatGrid, DistributionBar, Sparkline | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#charts](specimens/data.html#charts) · [data#g-gauge](specimens/data.html#g-gauge) |
| data / tables | Table, ComparisonTable, ScrollableGrid, VirtualList, List, DescriptionList, TreeView, Timeline, PaginationBar | data | ✓ [06 §5](06-data-and-charts.md#5-table-table) · [06 §9](06-data-and-charts.md#9-collections) · [data#table](specimens/data.html#table) · [data#collections](specimens/data.html#collections) |
| data / calendar and scheduling | CalendarView, CalendarGrid, DayCell, DayColumn, EventChip, EventPopover, BookingCalendar, ScheduleGrid, ScheduleHeader, ScheduleBlockButton, ScheduleOverlays, SlotPickerCard, MeetingPlanner, ManualTimeCard, MeetingMetaCard, AttendeesCard | app | ✓ [07 §2](07-app-patterns.md#2-calendar-booking-and-planner) · [app#calendar](specimens/app.html#calendar) |
| display | Avatar, Badge, Tag, Kbd, Separator, Anchor, Image, Quote, MetaList, Truncate, NumberFormat, RelativeTime, CopyButton, ShareButton, QRCode | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#display](specimens/components.html#display) · [components#qr-share](specimens/components.html#qr-share) |
| display / code and content | Code, CodeBlock, Markdown | rich | ✓ [04 Code · CodeBlock](04-inputs-rich.md#code--codeblock--markdown-display) · [inputs-rich#cb-demo](specimens/inputs-rich.html#cb-demo) · [inputs-rich#md-demo](specimens/inputs-rich.html#md-demo) |
| display / stats | Stat, StatRow, CountUp, Sparkline | data | ✓ [06 §11](06-data-and-charts.md#11-stats) · [data#kpis](specimens/data.html#kpis) · [data#statrow](specimens/data.html#statrow) |
| display / expressive text | ScrambleText, Typewriter | market | ✓ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [marketing#top](specimens/marketing.html#top) |
| feedback | Toast, Alert, Callout, Progress, ProgressCircle, Spinner, Skeleton, SkeletonScope, EmptyState, CountdownTimer | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#feedback](specimens/components.html#feedback) |
| feedback / expressive | Confetti, FactCarousel | market | ✓ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [08 §3.11](08-marketing-and-expressive.md#311-session-lobby-and-fact-carousel-sessionlobby-oldfeedbackloadingfactcarouseltsx) · [marketing#facts](specimens/marketing.html#facts) |
| feedback / gating | SignGateBadge, SignGateBlocker, SignGateFlow (wallet or sign-in gate flow) | app | ✓ [09 §2.4](09-app-flows.md#24-signgate-an-action-gated-on-a-signed-agreement-providers-embedded-signer) · [flows#admin](specimens/flows.html#admin) |
| forms | FormField, KitForm, DynamicForm (schema-driven) | inputs | ✓ [03 §6](03-inputs.md#6-forms) · [inputs#forms](specimens/inputs.html#forms) |
| inputs | every file in `inputs/**` | inputs; Address, Phone, PlaceLookup and PaymentCard go to rich | ✓ [03 §3](03-inputs.md#3-text-family) · [04 §3](04-inputs-rich.md#3-identity-and-location) · [inputs#text](specimens/inputs.html#text) · [inputs-rich#phone-demo](specimens/inputs-rich.html#phone-demo) |
| layout | Stack, Grid, Container, Section, Masonry, AspectRatio, ScrollArea, SplitPane, PageHeader, DraggablePanel | layout | ✓ [02 §3](02-layout.md#3-primitives) · [02 §4](02-layout.md#4-page-parts-coverage-rows) · [layout#primitives](specimens/layout.html#primitives) · [layout#parts](specimens/layout.html#parts) |
| layout / surfaces and selection | Card, Panel, Accordion, Tabs, Segmented, Pill, ToggleChip, FilterPanel | comp (FilterPanel goes to data) | ✓ [05 §4](05-components.md#4-navigation-widgets) · [06 §13](06-data-and-charts.md#13-find-compare-build) · [components#nav](specimens/components.html#nav) · [data#facets](specimens/data.html#facets) |
| marketing | Hero, CTA, FeatureGrid, LogoCloud, PricingCard, ProductCard, TestimonialCard, FAQ, NewsletterForm, Footer, SessionLobby | market | ✓ [08 §3](08-marketing-and-expressive.md#3-marketing-blocks) · [marketing#landing](specimens/marketing.html#landing) |
| meet (video) | MeetingRoom, MeetingLobby, MeetingPrejoin, MeetingScheduledLobby, MeetingCountdown, MeetingTile, MeetingControlBar, MeetingSidebar, MeetingPresentationPip, the Gallery, Speaker, Presentation and BoardFirst layouts | app | ✓ [07 §3](07-app-patterns.md#3-video-meetings) · [app#meet](specimens/app.html#meet) |
| nav | AppShell, Sidebar, TopNav, BottomNav, NavList, Breadcrumb, Stepper, AnchorNav, StickyBar, Banner, AnnouncementBar, CookieBanner | layout (Stepper goes to comp) | ✓ [02 §5](02-layout.md#5-navigation-parts) · [02 §6](02-layout.md#6-the-app-shell) · [layout#nav](specimens/layout.html#nav) · [layout#parts](specimens/layout.html#parts) |
| overlays | Modal, AlertDialog, Drawer, Popover, Tooltip, HoverCard, Menu, ContextMenu, OverflowMenu, CommandPalette, Lightbox, FloatingPortal, SweepBorderOverlay | comp (Lightbox goes to market) | ✓ [05 §3](05-components.md#3-overlays) · [08 §5.2](08-marketing-and-expressive.md#52-lightbox-and-gallery-oldoverlaysdialogslightboxtsx) · [components#overlays](specimens/components.html#overlays) · [marketing#lightbox](specimens/marketing.html#lightbox) |
| pickers | Select, Combobox, MultiCombobox, ColorPicker | inputs | ✓ [03 §4](03-inputs.md#4-choice-family) · [inputs#choice](specimens/inputs.html#choice) |
| pickers / dates | DatePicker, DateRangePicker, DateTimePicker, TimePicker, MonthPicker | rich | ✓ [04 §2](04-inputs-rich.md#2-temporal-inputs) · [inputs-rich#date-demo](specimens/inputs-rich.html#date-demo) |
| realtime and multiplayer UI | live cursors, presence avatars, synced state indicators, `.live` status | app | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [07 §4.4](07-app-patterns.md#44-live-connection-status) · [app#collab](specimens/app.html#collab) · [app#notify](specimens/app.html#notify) |
| theme *(added)* | ThemeProvider (light, dark, system), ThemeToggle, Logo (theme-aware mark), FaviconSwitcher (favicon follows scheme) | comp (ThemeToggle, Logo); layout (ThemeProvider wiring, FaviconSwitcher). `defineTheme` / `ThemeStyle` stay with foundations (`01`) | ◐ [05 §2](05-components.md#2-actions) · [02 §9](02-layout.md#9-responsive-rules) · [components#actions](specimens/components.html#actions) · missing: FaviconSwitcher demo |
| icons *(added)* | the icon set in `icons/index.tsx` | comp, drawn to `00` §6 | ✓ [05 §6](05-components.md#6-display-atoms) · [components#icons](specimens/components.html#icons) |
| motion *(added)* | Motion preset registry as a user-facing feature: 32 presets in 8 families (enter, modal, sheet, toast, tooltip, dropdown, palette, and `fancy`: crt-on, crt-off, flicker, glitch, spotlight, iris), `MotionConfigProvider` with per-component override, `useMotionDisabled` | comp (registry and per-component override); market (the `fancy` family) | ◐ [05 §8](05-components.md#8-motion-presets-registry) · [08 §6](08-marketing-and-expressive.md#6-expressive-catalogue-beyond-13) · [components#feedback](specimens/components.html#feedback) · missing: `fancy` family demo (crt, glitch, iris) |
| motion components *(added)* | ScrollReveal, AnimatedGrid / AnimatedGridItem (staggered grid), MotionCard, ModalBackdrop | market (ScrollReveal, AnimatedGrid, MotionCard); comp (ModalBackdrop) | ◐ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [marketing#top](specimens/marketing.html#top) · [marketing#listings](specimens/marketing.html#listings) · missing: MotionCard demo |
| parallax *(added)* | Parallax (scroll), ParallaxScene + ParallaxLayer (layered depth hero), TiltCard (tilt, lift, glare), MagneticElement, and the hooks `useScrollParallax`, `useMouseParallax`, `useGlobalMouse`, `useDocumentScroll`, `useInViewport` | market | ✓ [08 §3.13](08-marketing-and-expressive.md#313-parallaxscene-oldparallax-parallaxscene--parallaxlayer) · [marketing#depth](specimens/marketing.html#depth) |
| hooks with visible behaviour *(added)* | `useShaderThemeTransition` (a shader wipe on theme change), `useSlidingIndicator` (sliding tab and segmented indicator), `useContainerOverflow` (items overflow into a "more" menu), `useInfiniteScroll`, `useKeyboardShortcuts`, FadeMask (scroll-edge fade, from the hooks page) | market (shader transition); comp (sliding indicator, overflow); data (infinite scroll); app (shortcuts and their help overlay); layout (FadeMask on ScrollArea) | ✓ [08 §6.1](08-marketing-and-expressive.md#61-theme-transition-old-useshaderthemetransition) · [09 §7](09-app-flows.md#7-keyboard-shortcuts-overlay) · [marketing#theme-note](specimens/marketing.html#theme-note) · [flows#kbd-slot](specimens/flows.html#kbd-slot) |
| multiplayer *(added, detail)* | LiveCursorsOverlay (peer cursors, click ripple, hover outline), LiveHover / LiveClick / Live, LiveSection (which section each peer is looking at), LiveViewport (a rail showing each peer's viewport), MultiplayerAutoTrack, `usePeers` | app | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [07 §6.4](07-app-patterns.md#64-coverage-additions-v02) · [app#collab](specimens/app.html#collab) · [marketing#together](specimens/marketing.html#together) |
| realtime UI *(added, detail)* | PageCursorsLayer (cursors anchored to elements, so they line up across viewport sizes), InteractionRelay (replays a peer's hover, focus and press using the component's own visuals), SyncedDom (SyncedClass, SyncedScroll, SyncedAttribute, SyncedHash), SyncedTree, `useSmoothNumber` (tweened live numbers) | app; `useSmoothNumber` goes to data for live stats | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [06 §7](06-data-and-charts.md#7-live-updates) · [app#collab-demo](specimens/app.html#collab-demo) · [data#live-chart](specimens/data.html#live-chart) |
| data *(added)* | LiveTable (a resource-backed table with SSR hydration and realtime invalidation) | data | ✓ [06 §7](06-data-and-charts.md#7-live-updates) · [data#live](specimens/data.html#live) |
| validation *(added)* | `useForm`, `V` validators, `zodErrorsToFieldMap` (maps errors to fields) | inputs | ✓ [03 §1.3](03-inputs.md#13-validation-timing) · [inputs#validation](specimens/inputs.html#validation) |
| primitives *(added)* | HoverScope, `useIconSweepHover`, Dot, AvatarGroup, PillLink, HStack / VStack / Spacer / Center, SidebarLayout | inputs (HoverScope, icon sweep); comp (Dot, AvatarGroup, PillLink); layout (the rest) | ◐ [03 §7](03-inputs.md#7-shared-mechanics) · [05 §6](05-components.md#6-display-atoms) · [02 §3](02-layout.md#3-primitives) · [inputs#more](specimens/inputs.html#more) · [layout#primitives](specimens/layout.html#primitives) · missing: Spacer demo |
| sandbox recipes *(added)* | **Chat:** channel list, bubbles, composer. **Dashboard:** KPI header, capacity gauges, incidents with a timeline, deploy activity, team activity, notes card. **Examples:** login card, settings panel with rows, dashboard tile, activity table with tabs, inline notification feed, danger zone. **Marketing:** a full landing page with variants. **Marketplace:** listing grid, filter rail, stats strip | app (chat, login, settings, notification feed, danger zone); data (dashboard, activity table); market (marketing page, marketplace listing card) | ✓ [07 §5](07-app-patterns.md#5-messaging-and-chat) · [09 §4](09-app-flows.md#4-settings-billing-and-admin) · [06 §11](06-data-and-charts.md#11-stats) · [08 §4.1](08-marketing-and-expressive.md#41-template-marketplace-the-old-sandbox-marketplace-recipe) · [app#chat](specimens/app.html#chat) · [flows#settings](specimens/flows.html#settings) · [data#devices](specimens/data.html#devices) · [marketing#templates](specimens/marketing.html#templates) |
| realtime sandbox recipes *(added)* | presence with a typing indicator, streaming agent chat over SSE, transport picker with connection status, reconnect state, all-inputs sync, live table, data-integrity panel (counts sent, received, duplicate and out-of-order events) | app (the data-integrity panel is a dev tool, P2) | ◐ [07 §4.4](07-app-patterns.md#44-live-connection-status) · [07 §6.4](07-app-patterns.md#64-coverage-additions-v02) · [app#notify](specimens/app.html#notify) · [app#collab](specimens/app.html#collab) · missing: transport picker (no spec, no demo) |

## 2. Beyond the original (from the coverage research)

Every row is something §1 does not already cover. Where a §1 component exists but lacks a whole mode, such as
CalendarView's week view or Drawer's snap points, the row names only the missing mode.

**Priority:** **P0**, core: a serious app hits it in its first month. **P1**, common: most apps of that family need it.
**P2**, niche: specialist, creative or pro apps need it.

**Kit key:**

| Key | Kit |
|---|---|
| shadcn | shadcn/ui, its blocks, and the shadcn registry |
| AIE | Vercel AI Elements (shadcn registry) |
| Radix | Radix Themes |
| Ark | Ark UI / Zag.js |
| Mantine | Mantine core and its extensions (dates, charts, notifications, spotlight, carousel, tiptap, dropzone, lightbox, nprogress, modals) |
| Chakra | Chakra UI v3 |
| MUI, MUIX | Material UI; MUI X (Data Grid, Pickers, Charts, Tree View, Scheduler, Chat) |
| Antd, AntPro | Ant Design; Ant Design Pro components |
| Carbon | IBM Carbon |
| Fluent | Microsoft Fluent 2 |
| Polaris | Shopify Polaris |
| Primer | GitHub Primer |
| Spectrum | Adobe Spectrum 2 / React Spectrum |
| Atlas | Atlassian Design System |
| M3 | Material 3 |
| Hero | HeroUI |
| Tremor | Tremor |
| Acet | Aceternity UI |
| Magic | Magic UI |
| coss | coss ui (formerly Origin UI) |

### 2.1 Inputs and form mechanics

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Field / Fieldset primitives (label, description, error, required mark, group legend) | every form; one way to wire `aria-describedby` | shadcn, Chakra, Ark, Fluent, Primer, Spectrum | P0 | inputs | ✓ [03 §6](03-inputs.md#6-forms) · [inputs#more](specimens/inputs.html#more) |
| Native select | mobile-first forms; long OS-native lists | shadcn, Chakra, Tremor | P1 | inputs | ✓ [03 §4](03-inputs.md#4-choice-family) · [inputs#choice](specimens/inputs.html#choice) |
| Checkbox card / radio card | plan and shipping choices, onboarding options | Chakra, Tremor, Mantine, coss | P0 | inputs | ✓ [03 §4](03-inputs.md#4-choice-family) · [inputs#choice](specimens/inputs.html#choice) |
| Toggle and ToggleGroup (pressed state, single or multi) | toolbar formatting, view switches | shadcn, Radix, Ark, Chakra, Tremor | P0 | comp | ✓ [05 §2](05-components.md#2-actions) · [components#fmt](specimens/components.html#fmt) |
| Autocomplete (free text with suggestions, not constrained to options) | search fields, tags, addresses | Antd, Primer, MUI, Hero | P1 | inputs | ✓ [03 §3](03-inputs.md#3-text-family) · [inputs#more](specimens/inputs.html#more) |
| Listbox (standalone, always-open selectable list) | transfer panes, side pickers | Ark, Chakra, Hero | P1 | inputs | ✓ [03 §4](03-inputs.md#4-choice-family) · [inputs#transfer](specimens/inputs.html#transfer) |
| Cascader / cascade select | category → subcategory, region pickers | Antd, Ark | P2 | inputs |  |
| TreeSelect (tree inside a select, checkable) | folder and org-unit pickers | Antd, MUIX | P2 | inputs |  |
| Transfer list (dual list with move buttons) | permission and column assignment | Antd, MUI | P2 | inputs |  |
| Checkbox tree with indeterminate parents | permission scopes, filter groups | Antd, MUIX, Carbon | P1 | inputs | ✓ [03 §4](03-inputs.md#4-choice-family) · [inputs#choice](specimens/inputs.html#choice) · [inputs#treesel](specimens/inputs.html#treesel) |
| Character counter and max length | bios, tweets, SMS | Mantine, Antd, Polaris | P1 | inputs | ✓ [03 §3](03-inputs.md#3-text-family) · [inputs#text](specimens/inputs.html#text) |
| Password strength meter and rules checklist | sign-up, reset | Mantine, coss | P1 | inputs | ✓ [03 §3](03-inputs.md#3-text-family) · [inputs#pw](specimens/inputs.html#pw) |
| Scrub number input (drag the label to change the value) | property inspectors in creative tools | Spectrum (number field), Figma-style tools | P2 | inputs |  |
| Angle slider / knob | rotation, audio and creative parameters | Ark | P2 | inputs |  |
| XY pad (2D slider) | gradient position, audio pan and depth | Spectrum (ColorArea pattern) | P2 | inputs |  |
| Range slider with histogram | price and duration facets | coss, MUI (pattern) | P2 | inputs |  |
| Color swatch picker and swatch display | brand palettes, tag colours | Chakra, Mantine, Spectrum | P1 | inputs | ✓ [03 §5](03-inputs.md#5-range-colour-and-files) · [inputs#color](specimens/inputs.html#color) |
| Color area, wheel and channel sliders, and an eyedropper | creative tools, theme editors | Spectrum, Ark, Chakra | P2 | inputs |  |
| Gradient editor (stops, angle) | design tools, theme builders | Spectrum (pattern), creative apps | P2 | inputs |  |
| File upload list with per-file progress, retry and remove | any upload beyond one file | Ark, Chakra, Carbon, Antd, Mantine, AIE (attachments) | P0 | inputs | ✓ [03 §5](03-inputs.md#5-range-colour-and-files) · [inputs#uploads](specimens/inputs.html#uploads) |
| Multi-step form / wizard with per-step validation | onboarding, checkout, setup | AntPro (StepsForm), Polaris, MUI | P0 | inputs | ✓ [03 §6](03-inputs.md#6-forms) · [inputs#wizard](specimens/inputs.html#wizard) |
| Unsaved-changes guard and save bar | settings pages, editors | Polaris (contextual save bar), Atlas | P1 | inputs | ✓ [03 §6](03-inputs.md#6-forms) · [inputs#dirty](specimens/inputs.html#dirty) |
| Form autosave indicator (saving, saved, failed) | documents, settings | Atlas, Notion-style apps | P1 | inputs | ✓ [03 §6](03-inputs.md#6-forms) · [inputs#as](specimens/inputs.html#as) |
| Signature pad | contracts, delivery proof | Ark | P2 | rich |  |
| Mentions input (@user, #channel triggers in a textarea) | comments, chat, AI prompts | Antd, Mantine (tiptap), Primer | P0 | rich | ✓ [04 MentionsInput](04-inputs-rich.md#mentionsinput) · [inputs-rich#mention-demo](specimens/inputs-rich.html#mention-demo) |
| Rich text editor (toolbar, bubble menu, slash menu, links, lists, tables, images) | content, comments, docs | Mantine (tiptap), Chakra, Antd | P0 | rich | ✓ [04 RichTextEditor](04-inputs-rich.md#richtexteditor) · [inputs-rich#rte-demo](specimens/inputs-rich.html#rte-demo) |
| Markdown editor with preview | dev tools, docs, issues | Primer (markdown editor), Atlas | P1 | rich | ✓ [04 MarkdownEditor](04-inputs-rich.md#markdowneditor) · [inputs-rich#md-demo](specimens/inputs-rich.html#md-demo) |
| Code editor input (syntax highlight, line numbers, lint markers) | configs, queries, scripting | Mantine (code-highlight, view only), AIE (sandbox), Carbon | P1 | rich | ✓ [04 CodeInput](04-inputs-rich.md#codeinput--jsoneditor--keyvalueeditor) · [inputs-rich#code-demo](specimens/inputs-rich.html#code-demo) |
| JSON / schema editor and viewer (collapsible tree) | admin, API tools, agent tool I/O | AIE (schema-display) | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#tree-demo](specimens/inputs-rich.html#tree-demo) |
| Emoji picker | chat, reactions, status | shadcn registry, coss, Primer (reactions) | P1 | rich | ✓ [04 EmojiPicker](04-inputs-rich.md#emojipicker--iconpicker) · [inputs-rich#emoji-demo](specimens/inputs-rich.html#emoji-demo) |
| GIF and sticker picker | chat | Discord-style apps, no major kit | P2 | app |  |
| Date input (typed, segmented day/month/year) | birthdays, forms without a calendar | Ark, Chakra, Spectrum, MUIX | P0 | rich | ✓ [04 DateField](04-inputs-rich.md#datefield) · [inputs-rich#date-demo](specimens/inputs-rich.html#date-demo) |
| Year, quarter and week pickers | finance and reporting periods | Mantine, Antd, MUIX | P1 | rich | ✓ [04 PeriodPicker](04-inputs-rich.md#periodpicker-year--quarter--month--week) · [inputs-rich#period-demo](specimens/inputs-rich.html#period-demo) |
| Date-range presets panel (Today, Last 7 days, This quarter) and comparison range | dashboards, analytics | Tremor, Antd, MUIX, coss | P0 | rich | ✓ [04 DateRangeField](04-inputs-rich.md#daterangefield) · [inputs-rich#range-demo](specimens/inputs-rich.html#range-demo) |
| Duration input (h:m:s, ISO) | timers, SLAs, video trims | Spectrum (pattern), Antd | P2 | rich |  |
| Time zone picker (search, offsets, current time) | scheduling, settings | Mantine (pattern), Atlas | P1 | rich | ✓ [04 TimeZoneSelect](04-inputs-rich.md#timezoneselect) · [inputs-rich#tz-demo](specimens/inputs-rich.html#tz-demo) |
| Recurrence rule editor (RRULE: daily, weekly on, until, count) | calendars, reminders | MUIX (Scheduler), Outlook / Google patterns | P1 | rich | ✓ [04 RecurrenceField](04-inputs-rich.md#recurrencefield-an-rrule-builder-in-plain-language) · [inputs-rich#rrule-demo](specimens/inputs-rich.html#rrule-demo) |
| Inline calendar (standalone, multi-month, multi-select) | availability, booking | shadcn, Mantine, Chakra, Tremor, Atlas | P0 | rich | ✓ [04 InlineCalendar](04-inputs-rich.md#inlinecalendar) · [inputs-rich#ic-demo](specimens/inputs-rich.html#ic-demo) |
| Image crop / avatar cropper (zoom, rotate, aspect) | profile photos, product images | Ark (image cropper), coss | P1 | rich | ✓ [04 ImageCropper](04-inputs-rich.md#imagecropper--cameracapture) · [inputs-rich#crop-demo](specimens/inputs-rich.html#crop-demo) |
| Camera and screen capture input | KYC, avatars, bug reports | no major kit | P2 | rich |  |
| Speech input with mic selector | voice prompts, dictation | AIE (speech-input, mic-selector) | P1 | app | ✓ [07 §6.4](07-app-patterns.md#64-coverage-additions-v02) · [app#ai-parts](specimens/app.html#ai-parts) |
| Query builder (field, operator, value groups with AND/OR) | admin filters, segments | AntPro (pattern), MUIX (filter panel) | P2 | data |  |

### 2.2 Components and overlays

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Collapsible / Disclosure (single, not an accordion) | "show more", advanced options | shadcn, Radix, Ark, Chakra, Primer, Spectrum | P0 | comp | ✓ [05 §4](05-components.md#4-navigation-widgets) · [components#disc1](specimens/components.html#disc1) |
| Popconfirm (inline confirm anchored to a button) | low-stakes destructive actions | Antd | P1 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#pc1](specimens/components.html#pc1) |
| Toggletip / contextual help (click-to-open info) | explaining fields, touch-friendly help | Carbon, Chakra, Spectrum, Fluent (info label) | P1 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#tt1](specimens/components.html#tt1) |
| Split button (primary action plus menu) | "Merge ▾", "Save ▾" | Primer, Spectrum, M3, Fluent | P1 | comp | ✓ [05 §2](05-components.md#2-actions) · [components#t-split](specimens/components.html#t-split) |
| Floating action button and speed dial | mobile primary action | M3, Antd (FloatButton), MUI | P1 | comp | ✓ [05 §2](05-components.md#2-actions) · [components#fab-scroll](specimens/components.html#fab-scroll) · [components#sd](specimens/components.html#sd) |
| Menubar (File, Edit, View) | desktop-class editors, creative tools | shadcn, Radix | P2 | comp |  |
| Menu with checkbox and radio items and submenus | view options, sort | shadcn, Radix, Ark | P0 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#m-actions](specimens/components.html#m-actions) |
| Bottom sheet with snap points and drag to dismiss | mobile overlays, maps | shadcn (drawer), M3, Chakra | P0 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#sheet](specimens/components.html#sheet) |
| Overlay / modal manager (imperative open, stacking, `confirm()` helper) | apps opening dialogs from logic | Mantine (modals), Chakra, Antd (`App`), Primer | P1 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#confirm-go](specimens/components.html#confirm-go) |
| Item / list row (media, title, description, meta, actions) | settings rows, people lists, results | shadcn (item), Fluent (persona), Carbon (contained list) | P0 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#patterns](specimens/components.html#patterns) |
| Persona (avatar, name, secondary text, presence) | people everywhere | Fluent, Atlas | P1 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#patterns](specimens/components.html#patterns) |
| Avatar with presence/status ring and fallback initials | chat, collaboration | Fluent, Hero, Atlas, Chakra | P0 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#display](specimens/components.html#display) |
| Meter (value in a known range, distinct from progress) | quotas, disk, scores | Spectrum, Tremor (category bar) | P1 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#meter1](specimens/components.html#meter1) |
| Status light / indicator with label | health, deploy, order status | Spectrum, Chakra (status), Primer (state label) | P0 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#patterns](specimens/components.html#patterns) |
| Inline loading and button loading states | async actions | Carbon, M3 (loading indicator), Hero | P0 | comp | ✓ [05 §2](05-components.md#2-actions) · [components#load-btn](specimens/components.html#load-btn) |
| Toast with promise, action, undo and stacking | async feedback, undo | shadcn (sonner), Mantine, Chakra, Carbon | P0 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#undo-list](specimens/components.html#undo-list) |
| Global message bar / section message (full-width, in-page) | page-level warnings | Fluent (message bar), Atlas (section message), Primer (banner) | P1 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#patterns](specimens/components.html#patterns) |
| Highlight / mark (matched-text highlight) | search results, diffs | Chakra, Mantine | P1 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#overlays](specimens/components.html#overlays) |
| Link overlay (whole card clickable, inner links still work) | cards, list rows | Chakra | P1 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#patterns](specimens/components.html#patterns) |
| Watermark | confidential previews, drafts | Antd | P2 | comp |  |
| Stopwatch / elapsed timer | time tracking, calls, agent runs | Ark (timer) | P1 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#sw](specimens/components.html#sw) |
| Format helpers: bytes, duration, list, unit, compact numbers | file sizes, durations | Chakra (FormatByte, FormatNumber), Primer (RelativeTime) | P1 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#display](specimens/components.html#display) |
| Selection / floating text toolbar | editors, comments, AI "ask about this" | Carbon (text toolbar), Notion-style apps | P1 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#selwrap](specimens/components.html#selwrap) |
| Tour step popover primitive (anchored, with step count) | product tours | Ark, Antd, Atlas (spotlight) | P1 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#tour](specimens/components.html#tour) |
| Visually hidden | icon-only controls, extra labels | Chakra, Atlas, Radix (primitive) | P0 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#feedback](specimens/components.html#feedback) |
| Live region / announcer | async results, toasts, chat for screen readers | Spectrum, Atlas (pattern) | P0 | comp | ✓ [05 §5](05-components.md#5-feedback) · [components#feedback](specimens/components.html#feedback) |
| Focus scope and focus ring utilities | custom widgets, dialogs | Spectrum, Atlas | P0 | comp | ✓ [05 §3](05-components.md#3-overlays) · [components#dlg-invite](specimens/components.html#dlg-invite) |
| Language / locale switcher | i18n apps | Polaris (pattern), Carbon (header pattern) | P1 | comp | ✓ [05 §7](05-components.md#7-preferences-as-components) · [components#lang](specimens/components.html#lang) |
| Theme switcher (light, dark, system, as a menu or segmented) | every app | Magic (theme toggler), Radix, Chakra | P0 | comp | ✓ [05 §7](05-components.md#7-preferences-as-components) · [components#pref-theme](specimens/components.html#pref-theme) |
| Density control (compact, cozy, comfortable) | tables, admin, pro apps | MUIX (grid density), Carbon, Fluent | P1 | comp | ✓ [05 §7](05-components.md#7-preferences-as-components) · [components#pref-density](specimens/components.html#pref-density) |
| The warp dial as a user control (quiet ↔ balanced ↔ vivid) | user or tenant picks expression | Radix (ThemePanel is the nearest) | P1 | comp | ✓ [05 §7](05-components.md#7-preferences-as-components) · [components#pref-stop](specimens/components.html#pref-stop) |
| Theme panel (accent, radius, scaling, appearance, live preview) | white-label tenants, theme builders | Radix (ThemePanel), shadcn (themes page) | P2 | comp |  |
| Accessibility preferences panel (reduced motion, contrast, text size, underline links) | settings, a11y compliance | Fluent / Windows pattern | P2 | app |  |

### 2.3 Layout and navigation

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Navigation menu / mega menu | marketing and docs headers | shadcn, Radix, Ark, Acet | P1 | layout | ✓ [02 §5](02-layout.md#5-navigation-parts) · [layout#mega-1](specimens/layout.html#mega-1) |
| Navigation rail | tablet and desktop apps | M3, Fluent (nav) | P1 | layout | ✓ [02 §6](02-layout.md#6-the-app-shell) · [layout#g-rail](specimens/layout.html#g-rail) |
| Underline / tab navigation (route tabs) | repo-style section nav | Primer, Tremor | P0 | layout | ✓ [02 §5](02-layout.md#5-navigation-parts) · [layout#nav](specimens/layout.html#nav) |
| Route progress bar (top loading bar) | page transitions | Mantine (nprogress) | P1 | layout | ✓ [02 §8](02-layout.md#8-workbench-and-app-chrome) · [layout#rp1](specimens/layout.html#rp1) |
| Inspector / right panel (property panel that docks beside content) | creative tools, detail views | Carbon (right panel), Primer (PageLayout pane), Atlas (page layout) | P1 | layout | ✓ [02 §8](02-layout.md#8-workbench-and-app-chrome) · [layout#ins1](specimens/layout.html#ins1) |
| Workspace tabs (closable, reorderable document tabs) | editors, IDEs, admin | VS Code-style apps, Atlas | P2 | layout |  |
| Dockable panel layout (drag panels between docks, save the layout) | IDEs, creative and trading apps | no major kit (FlexLayout, dockview) | P2 | layout |  |
| Status bar (bottom, IDE-style) | editors, agent consoles | no major kit | P2 | layout |  |
| Infinite canvas with pan, zoom and minimap | whiteboards, node editors, design tools | AIE (canvas, controls, panel) | P2 | layout |  |
| Dashboard grid (draggable, resizable widgets) | custom dashboards | Tremor (pattern), AntPro | P1 | layout | ✓ [02 §8](02-layout.md#8-workbench-and-app-chrome) · [layout#board1](specimens/layout.html#board1) |
| Sticky / affix and scroll-to-top | long pages | Antd (Affix, FloatButton.BackTop) | P1 | layout | ✓ [02 §4](02-layout.md#4-page-parts-coverage-rows) · [02 §8](02-layout.md#8-workbench-and-app-chrome) · [layout#parts](specimens/layout.html#parts) · [layout#workbench](specimens/layout.html#workbench) |
| Wrap / cluster, bleed and inset | layout primitives | Chakra, Atlas, Radix (Inset) | P1 | layout | ✓ [02 §3](02-layout.md#3-primitives) · [02 §8](02-layout.md#8-workbench-and-app-chrome) · [layout#primitives](specimens/layout.html#primitives) · [layout#workbench](specimens/layout.html#workbench) |
| Skip link | keyboard and screen-reader users | Chakra (Skip Nav), Atlas | P0 | layout | ✓ [02 §6](02-layout.md#6-the-app-shell) · [layout#focus](specimens/layout.html#focus) |
| Direction provider (RTL) and locale provider | Arabic, Hebrew, i18n | shadcn (direction), Chakra (LocaleProvider), Ark, Spectrum | P0 | layout | ◐ [02 §9](02-layout.md#9-responsive-rules) · [layout#shells](specimens/layout.html#shells) · missing: locale provider (not in any spec; only RTL is) |
| Settings layout (section nav plus forms) | every app's settings | shadcn blocks, Polaris, Primer | P0 | layout | ✓ [02 §7](02-layout.md#7-masterdetail-and-templates) · [09 §4.1](09-app-flows.md#41-layout-and-rows-02-owns-the-page-frame-pageheader--banner--split--tabnav--dock) · [layout#tpl-nav](specimens/layout.html#tpl-nav) · [flows#settings](specimens/flows.html#settings) |
| Docs layout (left nav, content, "on this page" TOC with scroll spy, prev/next pager) | docs, help centres | shadcn, Mantine, Primer | P1 | layout | ✓ [02 §7](02-layout.md#7-masterdetail-and-templates) · [layout#tpl-nav](specimens/layout.html#tpl-nav) · [layout#an1](specimens/layout.html#an1) |
| Workspace / org switcher in the shell | multi-tenant SaaS | shadcn (sidebar blocks), Atlas | P0 | layout | ✓ [02 §6](02-layout.md#6-the-app-shell) · [layout#shells](specimens/layout.html#shells) |
| Pull to refresh | mobile web lists | M3 (pattern) | P2 | layout |  |

### 2.4 Data, tables and charts

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Data grid: column resize, reorder, pin, hide; sort; per-column filters; virtualised rows and columns | admin, finance, ops | MUIX, AntPro (ProTable), Carbon, Primer, Atlas (dynamic table) | P0 | data | ✓ [06 §5](06-data-and-charts.md#5-table-table) · [06 §6](06-data-and-charts.md#6-grid-at-scale-datagrid-specimen-08) · [data#table](specimens/data.html#table) · [data#sgrid](specimens/data.html#sgrid) |
| Grid: inline cell editing and validation | spreadsheets, CRUD | MUIX, AntPro (EditableProTable) | P1 | data | ✓ [06 §6](06-data-and-charts.md#6-grid-at-scale-datagrid-specimen-08) · [data#ops](specimens/data.html#ops) |
| Grid: row grouping, aggregation, tree data, master/detail expansion | reports, nested records | MUIX, Atlas (table tree), Antd | P1 | data | ◐ [06 §6](06-data-and-charts.md#6-grid-at-scale-datagrid-specimen-08) · [data#ops](specimens/data.html#ops) · [data#table](specimens/data.html#table) · missing: tree-data demo (grouping, footer aggregates and master/detail rows are shown) |
| Grid: pivot | BI | MUIX (premium) | P2 | data |  |
| Grid: export (CSV, XLSX), copy/paste ranges, clipboard | admin, finance | MUIX, AntPro | P1 | data | ✓ [06 §6](06-data-and-charts.md#6-grid-at-scale-datagrid-specimen-08) · [data#ops](specimens/data.html#ops) |
| Grid: saved views (columns, filters, sort as a named view) | power users | Polaris (index filters), Primer (pattern) | P1 | data | ✓ [06 §6](06-data-and-charts.md#6-grid-at-scale-datagrid-specimen-08) · [data#grid](specimens/data.html#grid) |
| Bulk action bar (appears on selection) | batch edit, delete, assign | Primer (ActionBar), Chakra, Spectrum, Polaris | P0 | data | ✓ [06 §5](06-data-and-charts.md#5-table-table) · [data#table](specimens/data.html#table) |
| Applied-filter chips with "clear all" | faceted search, tables | Polaris, Carbon (filtering) | P0 | data | ✓ [06 §13](06-data-and-charts.md#13-find-compare-build) · [data#facets](specimens/data.html#facets) |
| Faceted search results (facet counts, sort, result highlighting) | catalogues, docs, logs | Carbon (search pattern), Algolia-style | P1 | data | ✓ [06 §13](06-data-and-charts.md#13-find-compare-build) · [data#facets](specimens/data.html#facets) |
| Cursor "load more" and infinite list | feeds, logs | Mantine (pattern), Antd | P1 | data | ✓ [06 §8](06-data-and-charts.md#8-pagination-paginationbar) · [data#infinite](specimens/data.html#infinite) |
| Sortable / reorderable list (keyboard and pointer drag) | priorities, playlists, form builders | Atlas (pragmatic drag and drop), coss | P0 | data | ✓ [06 §14](06-data-and-charts.md#14-space-and-structure) · [04 SortableList](04-inputs-rich.md#sortablelist) · [data#sortable](specimens/data.html#sortable) · [inputs-rich#sort-demo](specimens/inputs-rich.html#sort-demo) |
| Swipe actions on list rows | mobile inboxes | M3 (pattern) | P2 | data |  |
| Area, stacked and percent bar, and combo (bar + line) charts | dashboards | Tremor, Mantine, MUIX | P0 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#g-combo](specimens/data.html#g-combo) · [data#g-pct](specimens/data.html#g-pct) |
| Pie, radial bar and funnel charts | conversion, share | Mantine, MUIX, Antd charts | P1 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#c-donut](specimens/data.html#c-donut) · [data#g-funnel](specimens/data.html#g-funnel) |
| Scatter and bubble charts | correlation | Mantine, MUIX | P1 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#c-scatter](specimens/data.html#c-scatter) · [data#g-bubble](specimens/data.html#g-bubble) |
| Radar chart | skills, comparisons | Mantine, MUIX | P2 | data |  |
| Treemap and sunburst | disk usage, budgets | MUIX, Antd charts | P2 | data |  |
| Sankey / flow chart | funnels, energy and money flows | Mantine, MUIX | P2 | data |  |
| Candlestick / OHLC, box plot, waterfall | finance, statistics | MUIX (pattern), Antd charts | P2 | data |  |
| Bar list (ranked horizontal bars with labels) | top pages, top referrers | Tremor | P0 | data | ✓ [06 §11](06-data-and-charts.md#11-stats) · [data#barlist](specimens/data.html#barlist) |
| Tracker / uptime bar | status pages, SLOs | Tremor | P1 | data | ✓ [06 §11](06-data-and-charts.md#11-stats) · [data#tracker](specimens/data.html#tracker) |
| Chart interaction: shared tooltip, crosshair, legend toggle, brush and zoom, reference lines and annotations | analysis | MUIX, Mantine, Tremor | P0 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#c-line](specimens/data.html#c-line) · [data#g-brush](specimens/data.html#g-brush) |
| Live streaming chart (rolling window) | monitoring, trading, agents | MUIX (pattern), Tremor | P1 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#g-stream](specimens/data.html#g-stream) |
| Calendar heatmap (contribution graph) | activity, habits | Mantine (heatmap) | P1 | data | ✓ [06 §12](06-data-and-charts.md#12-charts) · [data#g-cal](specimens/data.html#g-cal) |
| Choropleth / geo chart | regional metrics | MUIX (pattern), Antd charts | P2 | data |  |
| Interactive map (tiles, markers, clusters, popups, fit bounds) | stores, deliveries, assets | no core kit; MapLibre/Leaflet wrappers in coss and shadcn registries | P1 | data | ✓ [06 §14](06-data-and-charts.md#14-space-and-structure) · [data#map](specimens/data.html#map) |
| Map: draw areas, route lines, location pin picker | geofencing, delivery zones | MapLibre / Mapbox Draw patterns | P2 | data |  |
| Node graph / flow editor (nodes, edges, handles) | workflows, agent pipelines | AIE (node, edge, canvas), React Flow | P2 | data |  |
| Diff viewer (split and unified, inline word diff) | code review, versions, AI edits | Primer (pattern), AIE (commit) | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#diff-demo](specimens/inputs-rich.html#diff-demo) |
| Log viewer / terminal output (ANSI colour, follow tail, search) | CI, deploys, agent runs | AIE (terminal), Carbon (pattern) | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#log-demo](specimens/inputs-rich.html#log-demo) |
| Stack trace display (collapsible frames, hide internals) | error pages, dev tools | AIE (stack-trace) | P2 | rich |  |
| Test results summary (suites, pass/fail, durations) | CI, coding agents | AIE (test-results) | P2 | rich |  |
| File tree (expand, select, icons by type, git status) | file managers, IDEs, agents | AIE (file-tree), Magic (file tree), Primer (TreeView) | P1 | data | ✓ [06 §9](06-data-and-charts.md#9-collections) · [data#tree](specimens/data.html#tree) |
| Layers panel (tree with visibility and lock toggles, drag to reorder) | design and video tools | Figma-style apps | P2 | data |  |

### 2.5 Rich content and docs

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Prose / typography styles for rendered HTML | blogs, docs, AI answers | shadcn (typography), Chakra (prose), Radix | P0 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#prose-demo](specimens/inputs-rich.html#prose-demo) |
| Code group / code tabs (several languages or package managers) | docs, install snippets | Mantine (code-highlight tabs), AIE (snippet) | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#tabs-demo](specimens/inputs-rich.html#tabs-demo) |
| Snippet / one-line command with copy | install instructions | AIE (snippet), Carbon (code snippet) | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#tabs-demo](specimens/inputs-rich.html#tabs-demo) |
| Heading anchors with copy-link | docs | Primer, Docusaurus-style | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#p-ranges](specimens/inputs-rich.html#p-ranges) |
| Props / API reference table | component and API docs | Mantine, Chakra docs (pattern) | P2 | rich |  |
| Mermaid diagrams, KaTeX math, footnotes in Markdown | docs, AI answers | GitHub/Primer Markdown | P2 | rich |  |
| "Was this helpful?" feedback widget | docs, help centres | Primer docs, Atlas (pattern) | P2 | rich |  |
| Version switcher (docs or API version) | docs | Mantine and Docusaurus-style docs | P2 | layout |  |
| Link preview card (unfurl: title, image, site) | chat, docs, comments | Acet (link preview), Slack-style apps | P1 | rich | ✓ [04 §4b](04-inputs-rich.md#4b-docs-developer-and-content-display) · [inputs-rich#lp-demo](specimens/inputs-rich.html#lp-demo) |
| Embed / oEmbed frame with consent placeholder | videos, tweets, maps in content | Magic (tweet card) | P2 | rich |  |

### 2.6 Media, gallery and commerce

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Video player (custom controls, captions, chapters, speed, PiP, fullscreen) | courses, product demos, media apps | Magic (hero video dialog), Vidstack/Media Chrome | P1 | market | ◐ [08 §5.3](08-marketing-and-expressive.md#53-video-and-audio-player-chrome) · missing: demo |
| Audio player with waveform and scrub | podcasts, voice notes, AI voice | AIE (audio-player) | P1 | market | ◐ [08 §5.3](08-marketing-and-expressive.md#53-video-and-audio-player-chrome) · missing: demo |
| Image gallery grid with selection | photo apps, asset libraries | Antd (Image.PreviewGroup), Mantine | P1 | market | ◐ [08 §5.2](08-marketing-and-expressive.md#52-lightbox-and-gallery-oldoverlaysdialogslightboxtsx) · [marketing#gallery](specimens/marketing.html#gallery) · missing: selection in the demo (grid and lightbox only) |
| Zoom and pan image viewer | product detail, maps, documents | Antd (Image preview), Mantine (lightbox) | P1 | market | ✓ [08 §5.2](08-marketing-and-expressive.md#52-lightbox-and-gallery-oldoverlaysdialogslightboxtsx) · [marketing#lightbox](specimens/marketing.html#lightbox) · [marketing#zoom](specimens/marketing.html#zoom) |
| PDF / document viewer (pages, thumbnails, zoom) | contracts, invoices | no major kit | P2 | market |  |
| 3D model viewer | product, CAD, NFT | no major kit (model-viewer) | P2 | market |  |
| Image editor (filters, adjust, annotate) | creative, marketplaces | no major kit (pattern) | P2 | market |  |
| Product gallery (thumbnails, zoom on hover, video slides) | product detail page | Polaris (pattern), shadcn blocks | P1 | market | ✓ [08 §4](08-marketing-and-expressive.md#4-commerce) · [marketing#store](specimens/marketing.html#store) |
| Variant picker (colour swatches, sizes with stock state) | product detail | Polaris (pattern), Hero | P1 | market | ✓ [08 §4](08-marketing-and-expressive.md#4-commerce) · [marketing#v-color](specimens/marketing.html#v-color) |
| Reviews: rating summary histogram, review list, write a review | commerce, marketplaces | Polaris (pattern), Antd (Rate) | P1 | market | ◐ [08 §4](08-marketing-and-expressive.md#4-commerce) · [marketing#reviews](specimens/marketing.html#reviews) · missing: review list and “Write a review” demo (summary histogram only) |
| Cart drawer / mini-cart with quantity steppers | commerce | shadcn blocks, Polaris | P1 | app | ✓ [09 §6.1](09-app-flows.md#61-cart-drawer) · [flows#checkout](specimens/flows.html#checkout) · [marketing#cart](specimens/marketing.html#cart) |
| Checkout flow (address, shipping options, payment, review, confirmation) | commerce | Polaris (checkout UI extensions), shadcn blocks | P1 | app | ✓ [09 §6.2](09-app-flows.md#62-checkout-steps) · [flows#checkout](specimens/flows.html#checkout) |
| Order summary, coupon field, order status tracker | commerce, delivery | Polaris (pattern) | P1 | app | ✓ [09 §6.3](09-app-flows.md#63-confirmation) · [flows#checkout](specimens/flows.html#checkout) |
| Device and browser mockups (phone, browser, laptop frames) | landing pages, screenshots | Magic (iPhone, Safari, Android), Acet (MacBook scroll) | P1 | market | ✓ [08 §3.12](08-marketing-and-expressive.md#312-the-standard-section-set) · [marketing#top](specimens/marketing.html#top) |

### 2.7 App patterns: auth, onboarding, notifications

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Sign-in / sign-up screens (email, password, social buttons, magic link sent state) | every app | shadcn blocks (login), Carbon (login pattern), Acet (signup form) | P0 | app | ✓ [09 §2.1](09-app-flows.md#21-screens) · [flows#auth](specimens/flows.html#auth) |
| Passkey (WebAuthn) prompts: create, sign in, manage passkeys | modern auth | no major kit (pattern) | P1 | app | ✓ [09 §2.1](09-app-flows.md#21-screens) · [flows#auth](specimens/flows.html#auth) · [flows#settings](specimens/flows.html#settings) |
| MFA setup (QR, TOTP confirm, backup codes) and challenge | security | coss (OTP), pattern | P1 | app | ✓ [09 §2.3](09-app-flows.md#23-validation-and-errors) · [flows#settings](specimens/flows.html#settings) |
| Password reset and email verification flows | auth | shadcn blocks, Carbon | P0 | app | ✓ [09 §2.1](09-app-flows.md#21-screens) · [flows#auth](specimens/flows.html#auth) |
| Session expired / re-authenticate modal | security, long sessions | Carbon (pattern) | P1 | app | ✓ [09 §2.1](09-app-flows.md#21-screens) · [flows#settings](specimens/flows.html#settings) |
| Invite accept / join workspace screen | team SaaS | pattern | P1 | app | ✓ [09 §2.1](09-app-flows.md#21-screens) · [flows#auth](specimens/flows.html#auth) |
| Onboarding checklist (progress, dismiss, deep links) | activation | Polaris (setup guide pattern), Atlas | P1 | app | ✓ [09 §3.1](09-app-flows.md#31-checklist) · [flows#onboard](specimens/flows.html#onboard) |
| Product tour (multi-step, spotlight cut-out, beacons) | onboarding, feature launches | Ark (tour), Antd (Tour), Atlas (spotlight) | P1 | app | ✓ [09 §3.2](09-app-flows.md#32-product-tour-and-coachmarks-05s-tour-step-plus-spotlight-and-sequencing) · [flows#onboard](specimens/flows.html#onboard) |
| What's new / changelog panel | feature discovery | pattern | P2 | app |  |
| Notification center / inbox (tabs, unread, group by day, mark all read, archive) | every collaborative app | Carbon (notifications pattern), pattern | P0 | app | ✓ [07 §4.1](07-app-patterns.md#41-anatomy) · [app#notify](specimens/app.html#notify) |
| Notification bell with count and preview popover | app header | Carbon (header pattern), Atlas | P0 | app | ✓ [07 §4.1](07-app-patterns.md#41-anatomy) · [app#notify](specimens/app.html#notify) |
| Notification preferences matrix (event × channel) | settings | Polaris and GitHub settings (pattern) | P1 | app | ◐ [07 §4.2](07-app-patterns.md#42-rules) · [flows#settings](specimens/flows.html#settings) · missing: matrix demo (09 settings shows switch rows, not event × channel) |
| Push permission soft-ask | web push | pattern | P2 | app |  |
| Activity feed (actor, verb, object, time, grouped) | dashboards, records | Primer (Timeline), Antd (Timeline) | P0 | app | ✓ [07 §4.2](07-app-patterns.md#42-rules) · [app#notify](specimens/app.html#notify) · [data#collections](specimens/data.html#collections) |
| Keyboard shortcuts help overlay (`?`) | power users | Primer (KeybindingHint), GitHub | P1 | app | ✓ [09 §7](09-app-flows.md#7-keyboard-shortcuts-overlay) · [flows#kbd-slot](specimens/flows.html#kbd-slot) |

### 2.8 App patterns: messaging, comments, collaboration

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Conversation list (unread, last message, presence, pinned, muted) | messaging | MUIX (Chat), shadcn (message scroller) | P0 | app | ✓ [07 §5.1](07-app-patterns.md#51-anatomy) · [app#chat](specimens/app.html#chat) |
| Message thread: bubbles, grouping, day dividers, unread marker, jump to latest, stick to bottom | chat, AI | shadcn (message, bubble, message scroller), AIE (conversation), MUIX (Chat) | P0 | app | ✓ [07 §5.2](07-app-patterns.md#52-rules) · [app#chat](specimens/app.html#chat) |
| Composer with attachments, emoji, mentions, send-on-enter | chat, comments | AIE (prompt-input), MUIX (Chat) | P0 | app | ✓ [07 §5.1](07-app-patterns.md#51-anatomy) · [app#chat](specimens/app.html#chat) |
| Typing indicator, read receipts, delivery state | chat | MUIX (Chat), pattern | P1 | app | ✓ [07 §5.2](07-app-patterns.md#52-rules) · [app#chat](specimens/app.html#chat) |
| Reactions (picker plus counts with who reacted) | chat, comments | Primer (reactions), Atlas | P1 | app | ✓ [07 §5.2](07-app-patterns.md#52-rules) · [app#chat](specimens/app.html#chat) |
| Reply-in-thread and quote reply | chat | Slack-style pattern | P1 | app | ◐ [07 §5.2](07-app-patterns.md#52-rules) · [app#chat](specimens/app.html#chat) · missing: quote-reply demo (thread replies are shown) |
| Voice message (record, waveform, play) | chat | pattern | P2 | app |  |
| Comment thread (resolve, edit, delete, reply) | docs, design, tasks | Atlas (comment), Primer | P0 | app | ✓ [07 §6.2](07-app-patterns.md#62-comments-sharing-versions) · [app#collab](specimens/app.html#collab) |
| Anchored / inline comments (on text range, on canvas pin, margin rail) | docs, design review | pattern (Google Docs, Figma) | P1 | app | ✓ [07 §6.2](07-app-patterns.md#62-comments-sharing-versions) · [app#collab-demo](specimens/app.html#collab-demo) |
| Share dialog (invite by email, role per person, link access, copy link) | any shared object | Atlas, pattern | P0 | app | ✓ [07 §6.2](07-app-patterns.md#62-comments-sharing-versions) · [app#collab](specimens/app.html#collab) |
| Presence avatar stack with "following" mode | collaboration | Atlas, Liveblocks-style | P1 | app | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [app#collab](specimens/app.html#collab) |
| Peer selection highlights in text and on canvas | co-editing | Liveblocks / Yjs patterns | P1 | app | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [app#collab-demo](specimens/app.html#collab-demo) |
| Conflict and stale-data indicators ("edited by X, reload / merge") | concurrent editing, forms | pattern | P1 | app | ✓ [07 §6.1](07-app-patterns.md#61-parts) · [app#collab](specimens/app.html#collab) |
| Lock indicator (someone else is editing this) | records, CMS | pattern | P2 | app |  |
| Version history panel (list, preview, restore, named versions) | docs, design, configs | AIE (checkpoint), pattern | P1 | app | ✓ [07 §6.2](07-app-patterns.md#62-comments-sharing-versions) · [app#collab](specimens/app.html#collab) |
| Role / permission matrix (roles × capabilities) | admin, teams | AntPro (pattern), Carbon | P1 | app | ✓ [09 §4.2](09-app-flows.md#42-profile-members-and-roles-api-keys) · [flows#admin](specimens/flows.html#admin) |

### 2.9 App patterns: AI and agent UIs

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Streaming message (incremental Markdown render, streaming caret, no layout jump) | every AI chat | AIE (message), shadcn (message) | P0 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Prompt input (autosize, attachments, tool toggles, submit / stop, model picker slot) | AI chat, agents | AIE (prompt-input) | P0 | app | ✓ [07 §1.1](07-app-patterns.md#11-anatomy) · [app#ai-desk](specimens/app.html#ai-desk) |
| Model selector (provider groups, capabilities, cost, context size) | AI apps | AIE (model-selector) | P0 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Reasoning / thinking block (collapsible, duration, streams then collapses) | reasoning models | AIE (reasoning, chain-of-thought) | P0 | app | ✓ [07 §1.2](07-app-patterns.md#12-states) · [app#ai-desk](specimens/app.html#ai-desk) |
| Tool-call card (name, input, streaming state, output, error, duration) | agents | AIE (tool) | P0 | app | ✓ [07 §1.2](07-app-patterns.md#12-states) · [app#ai-parts](specimens/app.html#ai-parts) |
| Tool approval / confirmation (approve, deny, edit arguments, remember) | agent safety | AIE (confirmation) | P0 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Inline citations and sources list (hover preview, numbered refs) | RAG, search answers | AIE (inline-citation, sources) | P0 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Message actions (copy, retry, edit, branch, thumbs feedback) and branch switcher | AI chat | AIE (message) | P0 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Suggestions / starter prompts | empty chat, follow-ups | AIE (suggestion) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-parts](specimens/app.html#ai-parts) |
| Plan, task list and queue (agent steps with status) | agents | AIE (plan, task, queue) | P0 | app | ✓ [07 §1.2](07-app-patterns.md#12-states) · [app#ai-desk](specimens/app.html#ai-desk) |
| Agent run trace / timeline (spans, timings, tokens, nested calls) | debugging, observability | shadcn (trace), AIE (agent) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Context and usage meter (context window used, tokens, cost) | agents, chat | AIE (context) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-parts](specimens/app.html#ai-parts) |
| Artifact / canvas side panel (preview, code, versions) | generated docs, code, apps | AIE (artifact, web-preview, jsx-preview) | P1 | app | ✓ [07 §6.4](07-app-patterns.md#64-coverage-additions-v02) · [app#ai-parts](specimens/app.html#ai-parts) |
| Question / ask-user form (agent asks single or multi choice, free text) | human-in-the-loop | AIE (question), shadcn (questionnaire) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-parts](specimens/app.html#ai-parts) |
| Checkpoint / restore point in a conversation | coding agents | AIE (checkpoint) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-desk](specimens/app.html#ai-desk) |
| Shimmer / thinking text placeholder | pending AI output | AIE (shimmer) | P1 | app | ✓ [07 §1.3](07-app-patterns.md#13-behaviour) · [app#ai-parts](specimens/app.html#ai-parts) |
| Agent persona / voice orb (idle, listening, thinking, speaking states) | voice agents | AIE (persona) | P2 | app |  |
| Live transcription view | voice, meetings | AIE (transcription) | P2 | app |  |
| Sandbox / environment panel (env vars, packages, terminal, preview) | coding agents | AIE (sandbox, environment-variables, package-info, terminal) | P2 | app |  |
| Commit / change summary card (files changed, +/−, diff link) | coding agents | AIE (commit) | P2 | app |  |
| AI label / AI-generated marker and explainability popover | AI transparency | Carbon (AI label) | P1 | comp | ✓ [05 §6](05-components.md#6-display-atoms) · [components#ai1](specimens/components.html#ai1) |
| Connection / MCP server status list | agent tools | AIE (connection) | P2 | app |  |

### 2.10 App patterns: scheduling, settings, admin, system states

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Calendar week and day views (time grid, all-day row, now line, overlap layout) | scheduling | MUIX (Scheduler), Antd (Calendar, month only) | P0 | app | ✓ [07 §2.2](07-app-patterns.md#22-states-and-rules) · [app#calendar](specimens/app.html#calendar) |
| Agenda / list view and year view | scheduling | MUIX (Scheduler), FullCalendar | P1 | app | ◐ [07 §2.2](07-app-patterns.md#22-states-and-rules) · [app#calendar](specimens/app.html#calendar) · missing: year view demo (agenda is shown) |
| Resource / timeline view (rows of people or rooms over time) | rostering, rooms, rentals | MUIX (Event Timeline) | P1 | app | ✓ [07 §2.2](07-app-patterns.md#22-states-and-rules) · [app#calendar](specimens/app.html#calendar) |
| Event drag, resize and create-by-drag with snapping | scheduling | MUIX (Scheduler) | P0 | app | ✓ [07 §2.2](07-app-patterns.md#22-states-and-rules) · [app#calendar](specimens/app.html#calendar) |
| Recurring events and time-zone aware display | scheduling | MUIX (Scheduler, premium) | P1 | app | ✓ [07 §2.2](07-app-patterns.md#22-states-and-rules) · [app#calendar](specimens/app.html#calendar) |
| Availability editor (weekly hours, date overrides) | booking, staff | Cal.com-style pattern | P1 | app | ✓ [07 §6.4](07-app-patterns.md#64-coverage-additions-v02) · [app#calendar](specimens/app.html#calendar) |
| Gantt chart (tasks, dependencies, milestones) | project management | no core kit (pattern) | P2 | app |  |
| Kanban board (columns, card drag, swimlanes, WIP limits, quick add) | tasks, pipelines, CRM | Atlas (pragmatic dnd), pattern | P1 | app | ✓ [06 §10](06-data-and-charts.md#10-kanban) · [07 §6.2](07-app-patterns.md#62-comments-sharing-versions) · [data#kanban](specimens/data.html#kanban) · [app#collab](specimens/app.html#collab) |
| Plan picker / upgrade (current plan, compare, monthly / annual toggle) | billing | shadcn blocks, Polaris | P0 | app | ✓ [09 §4.3](09-app-flows.md#43-plans-usage-invoices-payment-method) · [flows#plans](specimens/flows.html#plans) |
| Usage meters with quotas and overage | billing, API products | Tremor (category bar), Polaris | P0 | app | ✓ [09 §4.3](09-app-flows.md#43-plans-usage-invoices-payment-method) · [flows#plans](specimens/flows.html#plans) |
| Invoices / billing history table and payment methods list | billing | Polaris, shadcn blocks | P1 | app | ✓ [09 §4.3](09-app-flows.md#43-plans-usage-invoices-payment-method) · [flows#plans](specimens/flows.html#plans) |
| Seat management (members, roles, invite, remove) | team SaaS | Polaris, Primer | P0 | app | ✓ [09 §4.2](09-app-flows.md#42-profile-members-and-roles-api-keys) · [flows#admin](specimens/flows.html#admin) |
| API keys manager (create, reveal once, copy, revoke, scopes) | developer products | pattern | P1 | app | ✓ [09 §4.2](09-app-flows.md#42-profile-members-and-roles-api-keys) · [flows#admin](specimens/flows.html#admin) |
| Webhooks / integrations grid (connect, status, configure) | SaaS | Polaris (pattern) | P1 | app | ✓ [09 §4.6](09-app-flows.md#46-integrations-and-webhooks) · [flows#admin](specimens/flows.html#admin) |
| Danger zone (delete, transfer, type-to-confirm) | settings | Primer (pattern) | P0 | app | ✓ [09 §4.4](09-app-flows.md#44-danger-zone) · [flows#settings](specimens/flows.html#settings) |
| CRUD resource pages (list → detail → edit → create, generated from a schema) | admin | AntPro (ProTable, ProForm, ProDescriptions), Refine-style | P0 | data | ✓ [06 §13](06-data-and-charts.md#13-find-compare-build) · [data#crud](specimens/data.html#crud) |
| Audit log viewer (actor, action, target, diff, filters, export) | admin, compliance | Carbon (pattern), pattern | P1 | app | ✓ [09 §4.5](09-app-flows.md#45-crud-with-bulk-actions-audit-log) · [flows#admin](specimens/flows.html#admin) |
| CSV import wizard (upload, column mapping, validation preview) | admin, onboarding | Polaris (pattern) | P1 | app | ✓ [09 §4.7](09-app-flows.md#47-csv-import-wizard) · [flows#admin](specimens/flows.html#admin) |
| Impersonation / "viewing as" banner | support tools | pattern | P2 | app |  |
| Feature flag and environment toggles list | admin, dev tools | pattern | P2 | app |  |
| Result pages (success, 403, 404, 500) | flows and errors | Antd (Result), Carbon | P0 | app | ◐ [09 §5.1](09-app-flows.md#51-result-page-anatomy) · [flows#system](specimens/flows.html#system) · [flows#auth](specimens/flows.html#auth) · missing: 403 demo (spec only; success, 404 and 500 are shown) |
| Offline banner and reconnecting indicator | PWA, realtime | pattern | P0 | app | ✓ [09 §5.3](09-app-flows.md#53-offline-and-reconnect) · [07 §4.4](07-app-patterns.md#44-live-connection-status) · [flows#system](specimens/flows.html#system) · [app#notify](specimens/app.html#notify) |
| Maintenance page and status banner | ops | pattern | P1 | app | ✓ [09 §5.1](09-app-flows.md#51-result-page-anatomy) · [flows#system](specimens/flows.html#system) |
| Error boundary fallback (retry, report, details) | resilience | pattern | P0 | app | ✓ [09 §5.1](09-app-flows.md#51-result-page-anatomy) · [flows#system](specimens/flows.html#system) |
| Update available / reload prompt | PWAs, long-lived tabs | pattern | P1 | app | ✓ [09 §5.4](09-app-flows.md#54-stale-deploy-schema-hash) · [flows#system](specimens/flows.html#system) |
| Rate-limited / quota-exceeded state | APIs, AI | pattern | P1 | app | ✓ [09 §5.5](09-app-flows.md#55-rate-limited) · [flows#system](specimens/flows.html#system) |

### 2.11 Marketing, creative and expressive

| Component or pattern | Use case | Kits | P | Owner | Status |
|---|---|---|---|---|---|
| Bento grid | feature sections | Magic, Acet | P0 | market | ✓ [08 §3.4](08-marketing-and-expressive.md#34-feature-grid-and-bento-featuregrid) · [marketing#product](specimens/marketing.html#product) |
| Marquee (logos, testimonials, pause on hover, vertical) | social proof | Magic, Ark, Chakra, Acet (infinite moving cards) | P0 | market | ✓ [08 §3.2](08-marketing-and-expressive.md#32-logo-cloud-and-marquee-logocloud) · [marketing#logo-marquee](specimens/marketing.html#logo-marquee) |
| Spotlight / cursor-glow card | feature cards, pricing | Acet (card spotlight), Magic (magic card) | P1 | market | ✓ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [marketing#product](specimens/marketing.html#product) |
| Border beam / shine border (travelling light along the border; a sibling of the sweep) | highlight a card or CTA | Magic (border beam, shine border), Antd (BorderBeam), Acet (moving border) | P1 | market | ✓ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [marketing#pricing](specimens/marketing.html#pricing) |
| Animated backgrounds: gradient / aurora, grid, dot and noise patterns, retro grid, light rays | hero sections | Magic, Acet | P1 | market | ◐ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [08 §6](08-marketing-and-expressive.md#6-expressive-catalogue-beyond-13) · [marketing#top](specimens/marketing.html#top) · missing: grid, dot, noise, retro-grid and light-ray demos (aurora is shown) |
| Particles, meteors, sparkles | celebratory and hero accents | Magic, Acet | P2 | market |  |
| Text effects: gradient and shiny text, word rotate, morphing text, text reveal on scroll, highlighter | headlines | Magic, Acet | P1 | market | ◐ [08 §1.3](08-marketing-and-expressive.md#13-registry-the-shipped-effects) · [08 §6](08-marketing-and-expressive.md#6-expressive-catalogue-beyond-13) · [marketing#hero-title](specimens/marketing.html#hero-title) · missing: shiny text, word rotate, morphing, scroll reveal and highlighter demos (gradient, scramble and typewriter are shown) |
| Scroll-driven sections: sticky scroll reveal, container scroll, scroll progress bar, scroll-velocity text | storytelling pages | Acet, Magic | P1 | market | ◐ [08 §3.5](08-marketing-and-expressive.md#35-scroll-story-sticky-scroll-reveal) · [08 §6](08-marketing-and-expressive.md#6-expressive-catalogue-beyond-13) · [marketing#story](specimens/marketing.html#story) · missing: container scroll, scroll progress bar and velocity text demos (sticky scroll story is shown) |
| Animated list (items arrive with stagger) | live activity on landing pages | Magic | P2 | market |  |
| Animated beam / connection diagram (integration hub) | "connects to everything" sections | Magic | P2 | market |  |
| Globe and dotted world map | global presence | Magic (globe, dotted map), Acet (world map) | P2 | market |  |
| Dock (magnifying icon bar) | creative nav, portfolios | Magic, Acet (floating dock) | P2 | market |  |
| Before/after compare slider | redesigns, image AI | Acet (compare) | P1 | market | ✓ [08 §5.4](08-marketing-and-expressive.md#54-compare-slider-qr-and-share) · [marketing#compare](specimens/marketing.html#compare) |
| Lens / magnifier | product images | Magic, Acet | P2 | market |  |
| Custom pointer and follow-pointer | creative sites | Magic (pointer, smooth cursor), Acet | P2 | market |  |
| Click effects (ripple, confetti burst on press, cool mode) | delight | Magic | P2 | market |  |
| Progressive blur edges | overflow and hero fades | Magic | P2 | market |  |
| Animated terminal / code comparison | dev-tool landing pages | Magic | P2 | market |  |
| Pricing table with monthly / annual toggle and feature matrix | pricing pages | shadcn blocks, Acet | P0 | market | ✓ [08 §3.7](08-marketing-and-expressive.md#37-pricing-cards-billing-toggle-comparison-table-pricingcard) · [marketing#pricing](specimens/marketing.html#pricing) |
| Testimonial wall (masonry, social embeds) | social proof | Magic (tweet card), Acet | P1 | market | ◐ [08 §3.6](08-marketing-and-expressive.md#36-testimonials-testimonialcard-card-wall-carousel) · [marketing#quotes](specimens/marketing.html#quotes) · missing: wall demo (carousel modes only) |
| Team, blog index, changelog, contact and waitlist sections | marketing sites | shadcn blocks, Acet (sections) | P1 | market | ◐ [08 §3.12](08-marketing-and-expressive.md#312-the-standard-section-set) · missing: demos (newsletter field and footer only) |
| Image slider with Ken Burns / parallax hero images | hero, portfolios | Acet (images slider, hero parallax) | P2 | market |  |

## 3. Gaps by owner

The counts are §2 rows, written as P0 / P1 / P2. Build P0 first. Each item below is a section in your spec plus a
demo in your specimen. Items marked **§1+** are original pieces that §1 had missed and are now added to it.

**inputs (22: 4 / 9 / 9).**
- **P0:** Field and Fieldset primitives, checkbox and radio cards, a file-upload list with per-file progress, and a
  multi-step form wizard.
- **P1:** native select, autocomplete, standalone listbox, checkbox tree, character counter, password strength,
  colour swatches, unsaved-changes save bar, autosave indicator.
- **P2:** cascader, tree select, transfer list, scrub number, knob, XY pad, histogram range slider, colour area and
  wheel, gradient editor.
- **§1+:** `useForm` and validators, HoverScope.
- All of these keep the sweep and the floating label (SIGNATURE §1–2).

**rich (29: 6 / 14 / 9).**
- **P0:** mentions input, rich-text editor, segmented date input, date-range presets with comparison, inline
  calendar, and prose styles for rendered HTML. AI answers and docs need the prose styles.
- **P1:** Markdown editor, code editor, JSON/schema viewer, emoji picker, year/quarter/week pickers, time-zone picker,
  RRULE editor, image cropper, diff viewer, log/terminal viewer, code tabs, snippet, heading anchors, link preview.
- **P2:** signature pad, duration input, camera capture, stack trace, test results, props table, Mermaid/KaTeX,
  feedback widget, embeds.

**comp (34: 13 / 18 / 3).**
- **P0:**
  - Toggle and ToggleGroup, Collapsible, and Item rows
  - Menu checkbox and radio items with submenus
  - bottom-sheet snap points
  - avatar presence ring, status light, inline and button loading, toast with promise and undo
  - visually hidden, live region, focus scope
  - the theme switcher
- **P1:** popconfirm, toggletip, split button, FAB and speed dial, overlay manager, persona, meter, section message,
  highlight, link overlay, stopwatch, format helpers, selection toolbar, tour step primitive, locale switcher,
  density control, **the warp dial as a user-facing control**, AI label.
- **P2:** menubar, watermark, theme panel.
- **§1+:** ThemeToggle, Logo, icon set, motion preset registry with per-component override, sliding indicator,
  overflow-to-more.

**data (32: 8 / 13 / 11).**
- **P0:** the data grid core (resize, reorder, pin, filter and virtualise), bulk action bar, applied-filter chips,
  sortable list, area/stacked/combo charts, bar list, chart interaction (shared tooltip, crosshair, legend, brush,
  annotations), and schema-driven CRUD pages.
- **P1:** cell editing, grouping and tree data, export and clipboard, saved views, faceted results, load-more, pie and
  funnel, scatter, tracker, live streaming chart, calendar heatmap, interactive map, file tree.
- **P2:** pivot, query builder, swipe rows, radar, treemap, Sankey, financial charts, choropleth, map drawing, node
  graph, layers panel.
- **§1+:** LiveTable, infinite scroll, `useSmoothNumber`.

**layout (19: 5 / 8 / 6).**
- **P0:** route tabs, skip link, direction and locale providers (RTL), settings layout, workspace/org switcher.
- **P1:** mega menu, nav rail, route progress bar, inspector panel, dashboard widget grid, affix and scroll-to-top,
  wrap/bleed/inset, docs layout with scroll-spy TOC.
- **P2:** workspace tabs, dockable panels, status bar, infinite canvas, pull-to-refresh, version switcher.
- **§1+:** ThemeProvider wiring, FaviconSwitcher, FadeMask, the stack helpers, SidebarLayout.

**app (83: 28 / 41 / 14).** This is the largest gap. Split `07` into sub-specs (`07a` auth and onboarding,
`07b` notifications, `07c` messaging and collaboration, `07d` AI and agents, `07e` scheduling, `07f` settings,
billing and admin, `07g` system states).
- **P0:**
  - sign-in and reset flows
  - notification inbox and bell, activity feed
  - conversation list, message thread, composer, comment thread, share dialog
  - streaming message, prompt input, model selector, reasoning, tool-call card, tool approval, citations, message
    actions and branching, plan/task/queue. **These are the agent-first core; treat them as the flagship demo.**
  - calendar week and day views, event drag and resize
  - plan picker, usage meters, seat management, danger zone
  - result pages, offline/reconnecting, error boundary
- **P1:** passkeys, MFA, re-auth, invites, onboarding checklist, product tour, notification preferences, shortcuts
  overlay, typing and receipts, reactions, threads, inline comments, following, peer selections, conflict
  indicators, version history, role matrix, suggestions, trace viewer, context meter, artifact panel, ask-user
  question, checkpoints, shimmer, agenda and year views, resource timeline, recurrence, availability editor, kanban,
  invoices, API keys, integrations, audit log, CSV import, maintenance, update prompt, rate-limited state, cart,
  checkout, order summary, speech input.
- **P2:** changelog panel, push soft-ask, voice messages, lock indicator, persona orb, transcription, sandbox panel,
  commit card, MCP status, Gantt, impersonation banner, feature flags, GIF picker, a11y preferences panel.
- **§1+:** multiplayer and realtime detail (LiveSection, LiveViewport, InteractionRelay, anchored cursors, SyncedDom),
  the recipes (chat, login, settings, notification feed), presence with typing, the transport/connection status UI.
- **Scope note:** commerce flows (cart, checkout, order) are assigned to app, because no owner was named for them.

**market (33: 3 / 16 / 14).**
- **P0:** bento grid, marquee, pricing table with billing toggle and feature matrix.
- **P1:**
  - spotlight card; border beam, which must be designed as a sibling of the sweep and must not compete with it
  - animated backgrounds, text effects, scroll-driven sections
  - before/after compare
  - media: video player, audio waveform, gallery, zoom viewer
  - commerce display: product gallery, variant picker, reviews
  - device mockups, testimonial wall, the standard section set
- **P2:** particles, animated list and beam, globe and map, dock, lens, custom pointer, click effects, progressive
  blur, animated terminal, PDF and 3D viewers, image editor, Ken Burns slider.
- **§1+:** the whole parallax module, ScrollReveal and AnimatedGrid, the `fancy` motion presets (crt, glitch, iris),
  the shader theme transition.
- **Expression note:** every market effect must respect the dial and reduced motion (`00` §8). By default nothing
  loops while idle, so marquee and backgrounds pause off-screen and under reduced motion.

## 4. Remaining

Every §1 row and every P0 / P1 row not yet ✓, from the audit of 2026-10-28. None is ✗; each is partial.

**layout**
- §1 theme: FaviconSwitcher has no demo.
- §1 primitives: Spacer has no demo.
- P0 direction and locale provider: RTL is done; no spec defines a locale provider.

**data**
- P1 grid grouping: tree data has no demo.

**app**
- §1 realtime sandbox recipes: the transport picker has no spec and no demo.
- P0 result pages: 403 is spec only.
- P1 notification preferences: no event × channel matrix demo.
- P1 reply-in-thread and quote reply: quote reply has no demo.
- P1 agenda and year views: year view has no demo.

**market**
- §1 motion: the `fancy` presets (crt, glitch, iris) have no demo.
- §1 motion components: MotionCard has no demo.
- P1 video player: spec only.
- P1 audio player with waveform: spec only.
- P1 image gallery with selection: no selection in the demo.
- P1 reviews: no review list or “Write a review” demo.
- P1 animated backgrounds: grid, dot, noise, retro-grid and light rays have no demo.
- P1 text effects: shiny text, word rotate, morphing text, scroll reveal and highlighter have no demo.
- P1 scroll-driven sections: container scroll, scroll progress bar and velocity text have no demo.
- P1 testimonial wall: no wall demo.
- P1 team, blog, changelog, contact and waitlist sections: spec only.

## Sources

Fetched 2026-10-28 for component lists:
- shadcn/ui components: https://ui.shadcn.com/docs/components
- Vercel AI Elements registry: https://elements.ai-sdk.dev/api/registry/registry.json
- Zag.js / Ark UI components: https://zagjs.com/overview/introduction
- Mantine packages: https://mantine.dev/getting-started/
- Chakra UI v3: https://www.chakra-ui.com/docs/components/concepts/overview
- MUI X products: https://mui.com/x/introduction/
- MUI X Scheduler (beta, v9): https://mui.com/x/react-scheduler/
- Ant Design and Pro components: https://ant.design/components/overview/
- IBM Carbon components and patterns: https://carbondesignsystem.com/components/overview/components/
- Fluent 2 React: https://fluent2.microsoft.design/components/web/react/
- GitHub Primer: https://primer.style/product/components/
- Atlassian Design System: https://atlassian.design/components
- Tremor: https://tremor.so/docs/getting-started/installation
- Magic UI: https://magicui.design/docs/components
- Aceternity UI: https://ui.aceternity.com/components

Docs consulted, where the fetch did not return a list and the rows rely on the documented component set:
- Radix Themes: https://www.radix-ui.com/themes/docs
- Material UI: https://mui.com/material-ui/
- Adobe React Spectrum / Spectrum 2: https://react-spectrum.adobe.com/
- Material 3: https://m3.material.io/components
- HeroUI: https://www.heroui.com/docs
- Shopify Polaris: https://shopify.dev/docs/api/polaris
- coss ui (formerly Origin UI; originui.com redirects there): https://coss.com/ui

Original source audited: `~/dev/agorix-discord/packages/ui/src` (`index.ts`, `components/**`, `hooks`, `motion`,
`parallax`, `multiplayer`, `realtime`, `theme`, `data`, `validation`) and `sandbox/src/pages/{recipes,motion,setup/realtime}`.

