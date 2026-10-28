# warp 09: App flows (auth, onboarding, settings, billing and admin, system states, commerce, shortcuts)

v0.2 · 2026-10-28. Changes since v0.1 are listed in §11.

Owner: flows. Specimen: `specimens/flows.html`. Styles: `tokens/warp-flows.css` (`@layer warp.flows`, after
`warp.app`; every selector is `:where()`, no `!important`). Coverage: every `app` row named in the brief is mapped in §9.

Primitives are reused by name, never redrawn: Field, Select, Checkbox, Switch, OTP, SegmentedControl → `03-inputs.md`;
Button, Badge, Alert, Banner, Dialog, AlertDialog, Sheet, Toast, Steps, Meter, Tour step, EmptyState, Kbd, Avatar,
Command palette → `05-components.md`; AppShell, PageHeader, Split, TabNav, Dock, BottomNav → `02-layout.md`; DataTable,
bulk bar, number formatting → `06-data-and-charts.md`; LiveStatus and `.live` states → `07-app-patterns.md` §4.4. A
flow is the order, copy, error mapping and motion between those primitives.

## 0. Flow principles

- **One task per step, one solid per step.** The primary action is the only solid button in view; Back is ghost.
  Secondary routes (passkey, SSO, magic link) are frame buttons, so the signature outline carries them.
- **Data first, chrome second.** A step never waits for its own animation: the next step's inputs are focusable as
  soon as they mount. Motion is a cue, never a gate.
- **Errors at the source.** Field errors under the field, flow errors at the top of the step, transport errors as a
  toast or banner. One message per cause (§1.3).
- **Nothing is lost.** Every destructive act gives Undo for 10 s (05 Toast) or asks first (type-to-confirm for
  irreversible ones). Forms keep their values across step changes, reloads (draft in `storage`) and offline.
- **The sweep has five jobs in flows, and only these:**
  1. **Focus** on every field (03), pinned in critical while the field is invalid (`data-invalid` on the control).
  2. **Choice** on selectable cards (plan, shipping, payment): the sweep draws in and stays pinned while checked.
  3. **Progress**: the Steps rail fills between steps; the onboarding checklist rail fills per completed item.
  4. **Arrival of the one thing that matters**: the tour spotlight ring, the OTP success cascade, the confirmation mark.
  5. **Warning for irreversible acts**: the type-to-confirm field sweeps critical, not accent.
  It never loops, never decorates a heading and never runs on a step transition itself.
- **Theming range:** flows read only tokens, so one markup set runs from quiet in a host site's palette (flat brand
  panel, border colour on choice, no cascades) to vivid (weave, sweeps, cascades, the mark). Every flow is checked in
  `fields: "floating"` and `"classic"`.

## 1. Shared flow machinery

### 1.1 Step machine

`[data-scope="flow"]` stacks steps in one grid cell (`grid-area: 1/1`), so height animates by content and there is no
layout jump. Each step is `[data-part="step"][data-state="active|leaving"]`. Forward enters from the inline-end, back
from the inline-start (`--_dir`, mirrored in RTL). The entering step waits `0.4 × --warp-flow-step` when the leaving
step is still visible (`data-after-exit`), so the two never cross-fade into mush.

After the enter, focus moves to the step title (`[data-part="step-title"]`, `tabindex="-1"`, no focus ring for a
programmatic focus) and the polite region announces "Step 2 of 4, Shipping". Browser history gets one entry per step
(`?step=shipping`), so the hardware Back button on a phone goes back a step, not out of the flow.

### 1.2 Binding to weft

Every flow submits through `<Form of={mutation}>`. The mutation's Zod `input` is the form schema; the same schema runs
on input (after first blur), on submit and on the server. Errors are typed in `.weft/contract.json`, so the flow knows
every code it can receive at build time.

```ts
// server/auth.ts
export const SignIn = z.object({ email: z.email(), password: z.string().min(8, 'At least 8 characters') })
export const signIn = mutation({
  input: SignIn,
  errors: { INVALID_CREDENTIALS: z.object({}), MFA_REQUIRED: z.object({ ticket: z.string(), methods: z.array(z.enum(['totp', 'sms', 'passkey'])) }),
            LOCKED: z.object({ until: z.iso.datetime() }), RATE_LIMITED: z.object({ retryAfter: z.number() }) },
  run: ({ input, ctx }) => ctx.auth.signIn(input),          // Better Auth underneath
})

// app/sign-in.tsx
const step = state<'credentials' | 'otp' | 'magic' | 'done'>('credentials')
<Form of={signIn} fields="floating"
      onError={{ MFA_REQUIRED: (e) => step.set('otp'), RATE_LIMITED: (e) => cooldown(e.retryAfter) }}
      onSuccess={() => step.set('done')}>
  <Field name="email" label="Email" autocomplete="username webauthn" />
  <Field name="password" type="password" label="Password" autocomplete="current-password" />
  <Form.Error />                               {/* form-level Alert: INVALID_CREDENTIALS, LOCKED */}
  <Form.Submit>Sign in</Form.Submit>           {/* pending: spinner + label kept, disabled, aria-busy */}
</Form>
```

`<Form>` works without JS (POST, server-rendered errors). With JS it adds live validation, pending state, the error
map below, and keeps focus where it was.

### 1.3 Error mapping (one message per cause)

| Source | Surface | Focus | Live region |
|---|---|---|---|
| Zod issue on a field path | Field error under the field, sweep pinned critical | first invalid field on submit | none on input; summary on submit ("2 fields need attention") |
| Typed domain error without a path (`INVALID_CREDENTIALS`) | `Form.Error`: Alert (05) at the top of the step | the Alert | assertive, once |
| `RATE_LIMITED` | Alert with a live countdown; submit disabled with the reason as its label ("Try again in 20s") | stays | polite at start and end |
| Network / 5xx | Toast (05) with Retry; values kept | stays | assertive |
| Offline at submit | Banner (§5.3); the mutation queues if `queue: true`, otherwise submit is disabled with a reason | stays | assertive, once |
| Stale schema (§5.4) | Banner "A new version is ready" | stays | polite |

Copy: what happened and what to do, in one sentence. Never "Invalid input", never blame.

### 1.4 Motion tokens and dial stops

Four tokens, all multiplied by `--warp-motion-scale`: `--warp-flow-step` (= `duration-slow`; exits at `exit-k`),
`--warp-flow-distance` (2 × `motion-distance`), `--warp-flow-cascade` (1.5 × `stagger`: OTP cells, checklist items,
confirmation lines) and `--warp-flow-rail` (2px + density × 2px: Steps and checklist rails).

| Moment | quiet | balanced | vivid |
|---|---|---|---|
| Step change | fade, 4px | fade + 12px slide | fade + 20px slide + slight scale-from |
| Steps rail fill | instant colour | sweep fills 1 segment | sweep fills, current node pulses once |
| Choice card | border colour | sweep draws, pinned | sweep draws + fill tint |
| OTP success | cells turn positive | cascade left→right | cascade + mark draws |
| Tour | spotlight jumps, card fades | spotlight glides, ring sweeps once | glide + ring + beacon on next target |
| Confirmation | static mark | mark strokes in | mark strokes in, lines cascade |
| Danger confirm | critical border | critical sweep on focus | same (never flashier: it is a warning) |

**Reduced motion** (`data-motion="reduce"` or the media query): steps swap instantly with a 120 ms opacity fade only,
cascades collapse to one change, the spotlight jumps, countdowns still count (they are information, not motion).
The sweep stays as a static stroke where it marks state (focus, invalid, checked), because it carries meaning.

### 1.5 Accessibility baseline (every flow)

- Each step is a `form`/`section` labelled by its title; Steps (05) uses `aria-current="step"`. Field errors use
  `aria-invalid` + `aria-describedby` (hints stay linked). Pending buttons keep their label, add a spinner and
  `aria-busy`, and stay focusable (`aria-disabled`).
- Countdowns announce at start and end only; timeouts ≥ 20 h or extendable (WCAG 2.2.1). `autocomplete` on every
  identity, address and payment field, `inputmode` on numeric ones, no paste blocking. Hit targets ≥ 44px on touch,
  ≥ 24px on fine pointers (WCAG 2.5.8).
- Overlays trap focus, close on Esc and return focus to the opener. Choice cards are native radios in a labelled
  radiogroup, and the sweep is never the only state cue (a check icon too). The payment iframe has a `title`.
- Every field has a visible `<label for>`; inputs carry no `aria-label`. A label whose letters are split for the
  floating-label cascade renders the name once in a `[data-part="sr-only"]` span and the letters `aria-hidden`, so the
  accessible name is the word, not "E m a i l". Tab strips (05 Tabs) take ← → Home End with automatic activation.
- Navigation labels never disappear: the tablet rail shows icon over a 12px label, and adds a 05 Tooltip with the
  shortcut ("Go to Members G M") wired by `aria-describedby`, shown on hover and on keyboard focus only.

### 1.6 Specimen frame placement

A device frame in the specimen is not a viewport: a top-layer `<dialog>`, a `position: fixed` toast region and a
`100dvh` shell would all escape to the page. The specimen therefore renders 05's dialog, sheet and toast **parts** in
a per-frame layer and sets `--warp-viewport-block: 100cqb` on the frame's app, so 02's shell measures the frame. In a
product none of this applies: use 05's Dialog, Sheet and Toast as shipped. Step containers in the specimen are marked
`data-flow-step="<name>"` (was `data-form`, which read as a weft attribute).

## 2. Auth and identity

### 2.1 Screens

| Screen | Contents | Primary | Secondary |
|---|---|---|---|
| Sign in | mark, title, passkey button, SSO buttons, divider, email, password, "Forgot?", remember | Sign in | Passkey, SSO, Email me a link |
| Sign up | name, email, password with strength Meter (05) and rules list, terms checkbox | Create account | SSO |
| MFA / OTP | "Code sent to •••• 42", OTP (03, 6 cells), resend countdown, "Use another method" | Verify (auto-submit on the 6th digit) | Back |
| Magic link | "Check your inbox", the address, Open mail app (phone), resend countdown, change email | none (waiting) | Resend |
| Reset / verify | email → OTP or link → new password + confirm | Continue | Back |
| Re-auth | Dialog (05) before sensitive acts: password or passkey, 5-minute grant | Confirm | Cancel |
| Invite accept | inviter avatar, org, role badge, "Join as ada@…"; sign in or create inline | Join Acme | Decline |
| Done | mark strokes in, "Signed in as …", continues to the return URL after 1.2 s (or immediately when reduced) | Continue | |

**Passkeys.** The email field carries `autocomplete="username webauthn"` so conditional UI offers passkeys from the
first focus. The explicit "Sign in with a passkey" frame button calls WebAuthn directly. After a password sign-in on a
device without a passkey, a one-time soft ask offers to create one (dismissible, never blocking). Cancelling the OS
sheet is not an error: nothing shows. **SSO:** Provider buttons are frame buttons with the provider's monochrome glyph, never its colours. Enterprise SSO is
"Continue with SSO" → email domain → redirect; the button shows pending until the redirect.

### 2.2 Phone, tablet, desktop (`container: auth`)

- **Phone (< 600):** full-bleed; mark at top; primary pinned above the keyboard (`env(keyboard-inset-height)` where
  available); SSO collapses to icon-only buttons in a row of three with names.
- **Tablet (600–999):** a 420px card (`--warp-flow-panel`) centred on the weave background.
- **Desktop (≥ 1000):** split: brand panel with the weave art and one line of product copy on the inline-start, card
  on the inline-end. The brand panel is decorative (`aria-hidden`), and at quiet it is a flat surface.

### 2.3 Validation and errors

- Email: format on blur; "No account for this email" is never revealed on sign-in (enumeration). It shows the same
  `INVALID_CREDENTIALS` Alert as a wrong password: "That email and password don't match. Try again or reset it."
- `LOCKED`: Alert with the unlock time and the reset link. `RATE_LIMITED`: §1.3.
- OTP: wrong code pins all cells critical, shakes nothing, clears and refocuses the first cell, says "That code didn't
  work. 2 tries left." Expired: "That code expired. We sent a new one." Paste of a full code fills all cells.

```ts
export const verifyOtp = mutation({
  input: z.object({ ticket: z.string(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }),
  errors: { WRONG_CODE: z.object({ attemptsLeft: z.number() }), EXPIRED: z.object({}) },
  run: ({ input, ctx }) => ctx.auth.verifyTotp(input),
})
<Form of={verifyOtp} autoSubmit="complete"><OTP name="code" length={6} autocomplete="one-time-code" /></Form>
```

### 2.4 SignGate (an action gated on a signed agreement, provider's embedded signer)

- **States:** `unsigned | pending | signed | expired | declined | error`. The signer iframe shows only while
  `unsigned` or `pending`; the terminal states show status copy with one action (Resend for expired/declined, Retry
  for error, Continue for signed).
- **Status:** `query({ input: z.object({ envelopeId }), run })` read with `.live` tags when the provider sends
  webhooks; otherwise polled every 3 s while `visible()` and stopped when signed or terminal.
- **Badge:** caution for unsigned/pending, positive for signed, critical for expired/declined, neutral for error.
- **Blocker:** the gated page renders behind a scrim with the gate card on top. The page is `inert`; the card is a
  non-modal region with a heading, so assistive tech reads it as the page's content, not as a dialog.
- **Phone:** the signer opens full-screen in a Sheet (05) at the 92% snap; tablet and desktop embed it inline at
  min 560px tall.
- **Motion:** when status turns `signed`, the iframe exits, the mark strokes in and the badge sweeps once (balanced+).

```ts
const status = query.live(signStatus, { input: () => ({ envelopeId }), tags: [`sign:${envelopeId}`] })
<SignGate status={status} src={signerUrl} onResend={resend} onSigned={() => nav('/workspace')}>
  <SignGate.Badge />  <SignGate.Blocker title="Sign the data agreement to continue" />
</SignGate>
```

## 3. Onboarding

### 3.1 Checklist

A card with a title, "3 of 5 done", a rail that fills with the sweep per completed item, and items as rows: check
icon, title, one-line description, and an action (frame button) on the inline-end. Done items strike nothing; they
dim the description and turn the check positive. Completing the last item replaces the list with "You're set up" and
a Hide button; Hide shows a Toast with Undo (10 s), and the checklist moves to Help.

- Items derive from server state, never from clicks: `query(onboardingStatus, { cache: { tags: ['onboarding'] } })`,
  and each item's own mutation `invalidates: ['onboarding']`. So doing the task anywhere checks it here.
- **Phone:** a collapsible card at the top of Home ("3 of 5"), actions move under the description. **Tablet/desktop:**
  a card in the main column; on desktop it can dock in the inline-end rail.
- **A11y:** a list; items say "done" / "to do"; the counter lives in the heading; a new completion announces once.

### 3.2 Product tour and coachmarks (05's Tour step, plus spotlight and sequencing)

- **Spotlight:** a rounded hole cut by a 9999px scrim shadow around the target, plus a sweep ring that draws once on
  arrival. The target stays interactive when the step says `interactive: true` ("Try it: click New"), otherwise the
  scrim blocks clicks and Esc ends the tour.
- **Card:** title, one or two sentences, pips plus "2 of 5", Back (hidden on step 1), Next / Done, and "Skip tour".
  It places beside the target with collision flip; on phone it docks to the top or bottom edge opposite the target.
- **Coachmark:** a single step without a scrim: a beacon dot on the target, the card on click. Dismissal persists per
  user (`mutation dismissHint`), never in `localStorage` alone.
- **Rules:** tours start only on request or on first run of a feature, never on top of another overlay; targets that
  are not on screen scroll into view first (instant when reduced); a missing target skips its step.
- **A11y:** focus moves to the card title; Tab cycles within the card; the target is described by the card
  (`aria-describedby`) while spotlit; ending the tour returns focus to where it started.

```ts
<Tour id="projects-v2" steps={[{ target: '[data-tour=new]', title: 'Start a project', body: '…', interactive: true }, …]}
      open={tourOpen} onDone={() => markTour({ id: 'projects-v2' })} />
```

## 4. Settings, billing and admin

### 4.1 Layout and rows (02 owns the page frame: PageHeader · Banner · Split · TabNav · Dock)

- **Nav:** horizontal TabNav on phone and tablet; a sticky column at ≥ 760px container width.
- **Section:** heading, one-line description, then **setting rows**: label + help on the inline-start, control on the
  inline-end (stacks under 520px). Switches apply immediately with a Toast; text fields batch into the save bar.
- **Save bar:** a Dock (02) that slides up when the form differs from its snapshot: "Unsaved changes", Discard,
  Save. Leaving with changes asks (AlertDialog). Saving keeps the bar with pending, then "Saved" for 1.5 s and slides
  away. Field errors keep the bar and focus the first invalid field.

```ts
const profile = query(getProfile, { cache: { tags: ['me'] } })
export const updateProfile = mutation({ input: Profile.pick({ name: true, email: true, handle: true }),
  errors: { HANDLE_TAKEN: z.object({ suggestion: z.string() }) }, invalidates: ['me'], run })
<Form of={updateProfile} initial={profile} saveBar>…</Form>    // saveBar = Dock + dirty diff + leave guard
```

### 4.2 Profile, members and roles, API keys

- **Profile:** avatar upload (03 file input, crop in a Dialog), name, email (changing it sends a verify OTP §2),
  handle (async uniqueness on blur with the suggestion as a one-click fix), time zone.
- **Members:** DataTable (06): avatar, name, email, role Select inline, last active, menu. Invite: Dialog with a
  multi-email field (chips) and a role; pending invites are rows with Resend / Revoke. Roles explained in a matrix
  (rows = permissions, columns = roles, checks), read-only unless the plan allows custom roles. Removing a member is an
  AlertDialog; demoting yourself warns that you'll lose access to this page.
- **Seats:** "7 of 10 seats used" over a rail that fills with the count; pending invites use a seat. Invites check
  the seats left before sending ("You have 3 seats left. Remove 1, or add seats in Billing."). The email field is a
  03 TagsInput: Enter, comma or a pasted list adds tags, an invalid address stays as a critical tag with one message
  for all of them, ⌫ highlights then removes. Selecting member rows raises a bulk bar ("2 selected · Remove 2
  members · Clear"); the last owner can't be demoted or removed, and the select says why (`aria-describedby`).
  Role changes apply at once with an Undo toast; removals are an AlertDialog with one Undo toast for the batch.
- **API keys:** list with name, prefix (`wk_live_3f…`), scopes, created, last used. Create: Dialog → name, scopes,
  expiry → the key is shown **once** in a read-only field with Copy, "You won't see this again", and a checkbox "I've
  saved it" before Done. Revoke is type-to-confirm when the key was used in the last 24 h, otherwise AlertDialog.
  Creating any key asks for re-auth first (§2.1, a 5-minute grant). **Live** keys sit behind SignGate (§2.4): the
  live-key list renders `inert` under the blocker until the data processing agreement is signed, the badge in the
  section header reads the gate state, and on `signed` focus moves to "Create live key".

### 4.3 Plans, usage, invoices, payment method

- **Plans:** radio cards (`role="radiogroup"`, native radios inside). Each card: name, price, the 3–5 lines that differ,
  "Current" badge. Checked card: sweep pinned (job 2). Monthly/Annual is a SegmentedControl; annual shows "−20%" and
  per-month price. Picking a different plan opens a Dialog: the proration line items, the new total, the date it
  applies, and Confirm. Downgrades list what will stop working.
- **Usage meters:** Meter (05) per resource with value, limit and the warning tick at 80%. Tones: neutral < 80%,
  caution ≥ 80%, critical at 100%, and overage as critical stripes past the limit with "+ $12.40 overage". Each meter
  links to the plan picker preselected on the next tier.
- **Invoices:** DataTable (06): date, number, amount, status Badge, PDF link. Failed payment pins a Banner at the top
  of Billing with "Update payment method".
- **Payment method:** the provider's hosted fields in an iframe slot (`[data-scope="pay-frame"]`); warp styles the
  slot (border, radius, loading shimmer, test-mode badge) and passes tokens to the provider's appearance API. warp
  never renders card fields itself.

```ts
export const changePlan = mutation({
  input: z.object({ plan: z.enum(['free', 'team', 'scale']), interval: z.enum(['month', 'year']) }),
  errors: { CARD_DECLINED: z.object({ reason: z.string() }), SEAT_LIMIT: z.object({ seats: z.number() }) },
  invalidates: ['billing', 'usage'], run,
})
const preview = query(prorationPreview, { input: () => ({ plan: pick.value, interval: interval.value }) })
```

### 4.4 Danger zone

A section with a critical border and heading. Each row: what it does, what it destroys, the button (critical soft).
Irreversible acts (delete project, transfer ownership) open an AlertDialog with type-to-confirm: the field's sweep is
critical (job 5), the confirm button stays disabled until the text matches exactly, and Enter submits only when it
matches. **Deviation from 05:** AlertDialog focuses Cancel by default; with type-to-confirm, focus goes to the field,
because typing is the required act and Cancel is one Tab away. Reversible acts (archive, leave) use a plain
AlertDialog and give Undo for 10 s.

```ts
export const deleteProject = mutation({ input: z.object({ id: z.string(), confirm: z.string() })
  .refine((v) => v.confirm === v.slug, { path: ['confirm'], message: 'Type the project name exactly' }),
  invalidates: ['projects'], run })
```

### 4.5 CRUD with bulk actions, audit log

- **CRUD:** list (DataTable, 06) → detail in a Sheet on tablet/desktop, a full page on phone → edit with the save bar.
  Create is a Dialog when ≤ 5 fields, otherwise a page. Bulk: selecting rows raises 06's bulk bar with the count,
  actions and Clear; destructive bulk acts are AlertDialog with the count in the button ("Delete 12 projects") and one
  Undo toast for the whole batch.
- **Audit log:** a read-only DataTable: time (relative, exact on hover/focus), actor, action verb, target link, IP,
  and a diff Sheet per event. Filters: actor, action, date range. New events arrive with `.live` and the 07 arrival
  grammar. Export is a mutation with `RATE_LIMITED` handled per §5.5.

### 4.6 Integrations and webhooks

- **Grid:** one card per provider (`[data-scope="integrations"]`, `auto-fill, minmax(260px, 1fr)`): logo, name, a
  status Badge with a dot (Connected positive · Needs attention critical · Connecting caution · Not connected
  neutral), one line (what it does when off, the account or the failure when on) and **one** action: Connect (frame),
  Reconnect (solid critical, the only critical solid on the page) or Configure (ghost). A failing card also takes a
  critical border, so the state is not colour on a dot alone.
- **Connect:** a Dialog lists exactly what the provider will be able to do, then "Continue to GitHub ↗" opens the
  provider's consent page. On return the card shows Connecting (polled or `.live`), then Connected with a Toast, and
  focus lands on Configure. A denied or failed consent returns the card to its previous state with an Alert in it.
- **Configure:** a Sheet with the provider's settings (channel, PR comments) and "Disconnect GitHub" (soft
  critical) at the inline-start of the footer; disconnect gives Undo for 10 s.
- **Webhooks:** rows of endpoint URL (mono), events, last delivery ("200 · 4 min ago") and a Healthy / Failing badge;
  "Send test" posts a sample event and reports the status code and time in a Toast. Add endpoint is a Dialog: https
  URL (validated on submit, then live) and event checkboxes; the signing secret is shown once, like an API key.

```ts
export const connectIntegration = mutation({ input: z.object({ provider: z.enum(['github', 'slack', 'linear', 'pagerduty']) }),
  run: ({ input, ctx }) => ctx.oauth.begin(input.provider) })            // → redirect URL; the card reads integrationStatus .live
export const addWebhook = mutation({ input: z.object({ url: z.url().startsWith('https://', 'Use a full https:// URL'),
  events: z.array(z.enum(['deploy.succeeded', 'deploy.failed', 'member.added'])).min(1) }), invalidates: ['webhooks'], run })
```

### 4.7 CSV import wizard

Four steps on 05 Steps: **Upload → Map → Review → Import**. Each step's heading takes focus and the polite region says
"Import, step 2 of 4, map columns".

1. **Upload:** a 03 Dropzone (`accept=".csv"`, first row is the header, row limit in the hint) plus "Use the sample".
   A non-CSV file is refused with a Toast before upload; nothing is sent until Map.
2. **Map:** a table of CSV column · sample value · "Imports as" (native Select, labelled "Name imports as"). Columns are
   pre-mapped by header name; every target can be "Don't import". Email is required: with no column on it, Review
   reports it once, not per row.
3. **Review:** an Alert says how many rows need a fix (caution) or that all pass (positive); the preview table marks a
   bad row with a critical tint and the bad **cell** with critical text plus an icon and the reason inline ("Use
   YYYY-MM-DD"), so the error is never colour alone. The primary counts what will happen: "Import 2 rows".
4. **Import:** a Progress (05) with `aria-valuenow`, then "2 people imported" with "Import another file", and a Toast.
   The job runs server-side; leaving the page is fine and the result is emailed.

Validation is the same Zod schema the single-member form uses, run per row on the server and returned as
`{ row, path, message }[]`, so the preview and the import can't disagree.

## 5. System states

### 5.1 Result page anatomy

`[data-scope="system-page"]`: EmptyState art (05, the weave), a code eyebrow (`404`), a title, one sentence, one
primary action, one secondary, and a support line with the request ID (copyable). It sits inside the app shell when
the shell rendered, so navigation still works; a bare version serves when the shell itself failed.

| State | Art | Title | Primary / secondary |
|---|---|---|---|
| 404 | weave with a broken weft thread | "We can't find that page" | Search field + Go home |
| 403 | weave with a lock knot | "You don't have access" | Request access (sends to admins) / Switch account |
| 500 / error boundary | broken thread in critical | "Something went wrong on our side" | Try again (`retry` from `<Boundary>`) / Go home |
| Maintenance | static weave | "Back at 14:00 UTC" with a local-time line | Status page link |
| Empty first run | weave in accent | "No projects yet" | Create project / Import |

`<Boundary error={(e, retry) => <SystemPage kind="500" error={e} onRetry={retry} />}>` is the default boundary at the
route level; component-level boundaries use a compact SectionMessage instead.

**Empty first run** differs from "no results": it teaches. One action, one sentence on what the thing is, optional sample-data button.
After the first item exists, the empty state never returns for that user (it becomes "no results" with Clear filters).

### 5.3 Offline and reconnect

Reads `online()` from `weft/browser` and the `.live` state (07 §4.4).
- **Offline:** caution Banner under the shell header: "You're offline. Changes are saved on this device and sync when
  you reconnect." plus "Retrying in 4s" and Retry now. Items edited offline show "Waiting to sync" chips. Server-only
  actions disable with a reason. Full offline page only for routes with no cached data.
- **Reconnecting** counts down weft's jittered backoff (0.5–30 s). **Online:** positive, "Back online. 2 changes
  synced.", leaves after 3 s. Phone wraps Retry under the text, never over the bottom nav. Offline announces
  assertively once; back online politely once.

### 5.4 Stale deploy (schema hash)

At connect, weft compares the tab's schema hash with the server's. On mismatch: an info Banner "A new version of
Fieldwork is ready" with Reload (solid) and Later. Later hides it for 30 minutes. Drafts are saved to `storage` before
reload, so nothing typed is lost. If a mutation fails because the contract changed, the Banner turns caution and the
failed action's Toast says "Reload to finish saving".

```ts
import { online } from 'weft/browser'
const conn = connection()            // { state: LiveState, stale: Signal<boolean> }
<ConnBanner online={online} state={conn.state} stale={conn.stale} onReload={saveDraftsAndReload} />
```

### 5.5 Rate limited

Caution Alert in place: "Export limit reached. You can run 5 exports a minute. Try again in 20s." with a draining
progress rail; the trigger button becomes disabled with "Try again in 20s" as its label, and comes back by itself.
Values come from the typed `RATE_LIMITED.retryAfter`, never a guess.

## 6. Commerce

### 6.1 Cart drawer

Sheet (05): right 420px on tablet/desktop, bottom sheet on phone (snap 50% / 92%). Line items: thumb, name, variant,
quantity stepper (min 1; remove at 0 asks nothing and gives Undo), price. Footer: subtotal, "Shipping and tax at
checkout", Checkout (solid). The cart icon's count badge bumps once when an item is added (balanced+).

### 6.2 Checkout steps

Cart → Address → Shipping → Payment → Review → Confirmation. Steps (05) at the top: full labels on tablet/desktop,
"Step 4 of 5 · Payment" with a bar on phone. Guest checkout first; sign-in is a link, not a wall.

- **Address:** country first (it decides the fields and order), name, line 1, line 2 (optional, collapsed behind
  "+ Apartment, suite"), city, region (Select where the country has them), postal code with per-country rules (US
  ZIP, GB postcode, DE 5 digits), phone (optional, with why). Full `autocomplete` set. Billing same as shipping
  (checkbox, checked).
- **Shipping:** radio cards (sweep pinned on choice): name, ETA as a date ("Arrives Thu 6 Nov"), price.
- **Payment:** a saved wallet frame button first, divider "or with a card", then the provider pay-frame (§4.3).
- **Review:** everything editable in place via "Edit" links back to a step (focus returns to the edited field).
- **Summary:** sticky column at ≥ 860px container; a `<details>` above the nav on smaller screens showing the total
  in its summary line. Coupon field inside it (`WARP10` in the specimen); applied codes show as removable chips with
  Undo.
- **Place order:** pending on the button; the mutation is idempotent by a client key so a double tap or a retry after
  a timeout never charges twice.

```ts
export const placeOrder = mutation({
  input: z.object({ cartId: z.string(), address: Address, shipping: z.enum(['standard', 'express']),
                    paymentToken: z.string(), idempotencyKey: z.uuid() }),
  errors: { CARD_DECLINED: z.object({ reason: z.string() }), OUT_OF_STOCK: z.object({ sku: z.string() }),
            PRICE_CHANGED: z.object({ total: z.number() }) },
  invalidates: ['cart', 'orders'], run,
})
```

`CARD_DECLINED` returns to Payment with an Alert; `OUT_OF_STOCK` returns to Cart with the line marked; `PRICE_CHANGED`
stays on Review and highlights the new total before asking again.

### 6.3 Confirmation

The mark strokes in, "Order #A-2041 confirmed", the email it was sent to, a tracker (ordered → packed → shipped →
delivered, the current node filled), the summary, and Continue shopping. The polite region announces the order
number. Reduced: static mark.

## 7. Keyboard shortcuts overlay

`?` (or Shift+/) opens a Dialog (05), bottom sheet on phone, listing shortcuts grouped (Navigation, Actions, This
page) with Kbd (05) chips, platform-aware (⌘ vs Ctrl). A filter field at the top matches names and keys, with matches
in `<mark>`. Shortcuts come from one registry (`shortcuts.register({ keys, label, group, when })`), so the overlay is
always true. Never shown automatically; mentioned once in the help menu. Single-key shortcuts can be turned off in
settings (WCAG 2.1.4) and never fire inside text inputs.

## 8. Responsive matrix

| Flow | Phone < 600 | Tablet 600–999 | Desktop ≥ 1000 |
|---|---|---|---|
| Auth | full-bleed, primary above keyboard | 420 card on weave | split brand panel + card |
| SignGate | signer in Sheet 92% | inline signer | inline signer, badge in header |
| Checklist | collapsible card on Home | card in main column | card or inline-end rail |
| Tour | card docked top/bottom | anchored popover | anchored popover |
| Settings | TabNav, stacked rows | TabNav, rows side by side | sticky nav column, rows |
| Plans | cards stacked, picker sticky | 2-up | 3-up |
| Checkout | compact steps, summary in `<details>` | full steps, summary in `<details>` | summary sticky column |
| Shortcuts | bottom sheet, one column | dialog, two columns | dialog, three columns |
| Admin tabs | tab strip scrolls, selected tab kept in view | full strip | full strip |
| Members table | last active hidden, role select stays | all columns | all columns |
| Integrations | one card per row | 2-up | 3-up |
| CSV import | mapping and preview scroll inline | full tables | full tables |
| Dialogs | bottom sheet with grab handle, stacked footer | centred dialog | centred dialog |

## 9. Coverage map

| Row | Section | Specimen demo |
|---|---|---|
| Sign-in / sign-up, passkeys, SSO buttons, magic link | §2.1 | `#auth` (wrongpass → Alert; passkey/SSO → done) |
| MFA / OTP (one input, six painted cells) | §2.3 | `#auth` (any 6 digits passes, `000000` fails; paste works) |
| Password reset, verify by email | §2.1 | `#auth` (Forgot password → inbox step) |
| Accept an invite | §2.1 | `#auth` (Accept an invite: avatar, role badge, Join / Decline) |
| Re-auth before a sensitive act | §2.1 | `#settings` (Delete project), `#admin` (Create key) |
| MFA setup (QR, verify, backup codes) | §2.3 | `#settings` → Security → Set up |
| Passkey management | §2.1 | `#settings` → Security → Manage passkeys (add, remove + Undo) |
| SignGate: badge, blocker, flow | §2.4 | `#admin` → API keys → Live keys (unsigned → pending → signed) |
| Onboarding checklist, product tour, coachmarks | §3 | `#onboard` (Take the tour) |
| Settings layout and rows, profile, save bar | §4.1–4.2 | `#settings` |
| Seat management: members, roles, invite, remove (P0) | §4.2 | `#admin` → Members (paste a list, bulk remove + Undo) |
| Role and permission matrix | §4.2 | `#admin` → Roles |
| API keys: create once, reveal once, revoke | §4.2 | `#admin` → API keys |
| Bulk actions, audit log with filter and export | §4.5 | `#admin` → Members (bulk bar), Audit log (filter, rate-limited export) |
| Integrations and webhooks grid (connect, status, configure) | §4.6 | `#admin` → Integrations |
| CSV import wizard (upload, mapping, validation preview) | §4.7 | `#admin` → Import → Use the sample |
| Danger zone, type-to-confirm | §4.4 | `#settings` (type `fieldwork-prod`) |
| Plans and upgrade, usage meters, invoices | §4.3 | `#plans` |
| Payment methods (list, default, remove + Undo; provider iframe) | §4.3 | `#plans`, `#checkout` (placeholder slot) |
| 404 / 500 / maintenance | §5.1 | `#system` (404, 500, Maintenance with local time) |
| 403, empty first run | §5.1 | spec only (same `system-page` anatomy) |
| Offline / reconnect, stale deploy (schema hash), rate limited | §5.3–5.5 | `#system` (each state; they recover) |
| Cart drawer, checkout, address, shipping, summary, confirmation | §6 | `#checkout` (US/GB/DE postcodes, `WARP10`) |
| Keyboard-shortcut overlay | §7 | `?` anywhere on the specimen |

Settings bar: the canonical bar from 01 §13 (Expression · Fields · Theme · Density · Motion · Flair, then the page
extra Frames), with `?expression=&fields=&theme=&density=&motion=&flair=&frames=` deep links. Below 1024px it is one
56px row and a Settings sheet. Keys: 1/2/3 expression, T theme, F fields, D density, M motion, ? shortcuts. Checked in
headless Chrome on 2026-10-28 at 390, 834 and 1280 wide; quiet, balanced and vivid; light and dark; reduced motion;
and by keyboard (tabs, segmented, dialog trap and Esc, settings sheet). `node scripts/contrast-check.mjs`: 858 checks,
0 failures.

## 10. Handoffs

- **05 (bug):** `:where([data-scope="tabs"] [data-part="indicator"])` and the other tabs rules are descendant
  selectors, so they restyle any `[data-part="indicator"]` inside a tab panel (03 Segmented's indicator and the native
  Select chevron collapse to 1.5px). Scope them to the list (`[data-scope="tabs"] > [data-part="list"] >
  [data-part="indicator"]`). The specimen works around it by rendering panels beside the tabs root.
- **05:** Dialog and Toast are top-layer / fixed, which is right for products; specimens that frame devices need the
  part-level placement in §1.6. The `steps` scope is 05's alone now: flows no longer styles `[data-scope="steps"]`.
- **02:** `[data-scope="shell"] [data-part="main"]` is a descendant selector too; any `data-part="main"` inside the
  shell (a list row, a card) inherits the shell's main layout. Scope it to `> [data-part="layout"] > [data-part="main"]`.
  Flows renamed its own part to `info`.
- **Foundations:** the inline-block `[data-char]` letter split gives split labels an accessible name of separate
  letters. Flows splits a visually hidden whole word from `aria-hidden` letters (§1.5); the same fix belongs in
  `floatingLabel()`. `warp-sweep.js`: no bug found in this pass.
- **03:** flows uses the one-input OTP as shipped and adds only `data-invalid` (critical pin) and
  `data-state="success"` (cascade, `--n` per cell) on top. TagsInput is used for invite emails (§4.2).
- **07:** `warp-app.css` no longer defines auth, otp, gate, tour, checklist or system-page scopes; keep it that way.
- **06:** admin tables in the specimen are plain tables standing in for DataTable; the product uses 06's.

## 11. v0.2 changes

- Review 01: frame buttons default to the accent tone, so every frame shows a visible hover change (outline sweeps,
  label inks) at every stop; plan cards rest on `--warp-color-sweep-base`; meta text is `text-subtle`.
- Review 02: the canonical one-row settings bar (01 §13); `viewport-fit=cover`; link buttons are 05 `link` emphasis
  with the text touch floor; the pay-frame shimmer is `data-loop` (stops under reduced motion); index cards share a
  top line; `data-flow-step` replaces `data-form`.
- Review 03: rail links have names and tooltips; real `<label for>` everywhere; arrow-key tab strips; native
  checkboxes and segmented radios; the blockquote emphasis moves its accent to the underline (was 2.85:1); h3/h4
  outline in the demos; maintenance, reset, invite, re-auth, MFA setup, passkeys, payment methods, members, roles,
  API keys, SignGate, audit, integrations and CSV import are built (§9).
