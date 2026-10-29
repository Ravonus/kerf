//! weft/browser diagnostics: W050, W051, W054, W056 (PLAN §4.2, research 07 §9.3).

use weft_compiler::{Diagnostic, Options, Severity, compile};

fn check(source: &str) -> Vec<Diagnostic> {
    compile(source, &Options { filename: "App.tsx".into(), check_only: true, ..Default::default() }).diagnostics
}

fn with(source: &str, generate: &str, hydratable: bool) -> Vec<Diagnostic> {
    let o = Options { filename: "App.tsx".into(), generate: generate.into(), hydratable, ..Default::default() };
    compile(source, &o).diagnostics
}

fn only<'d>(d: &'d [Diagnostic], code: &str) -> Vec<&'d Diagnostic> {
    d.iter().filter(|d| d.code == code).collect()
}

fn has(d: &[Diagnostic], code: &str) -> bool {
    d.iter().any(|d| d.code == code)
}

fn one<'d>(d: &'d [Diagnostic], code: &str) -> &'d Diagnostic {
    let found = only(d, code);
    assert_eq!(found.len(), 1, "expected one {code}: {d:#?}");
    found[0]
}

fn apply_fix(source: &str, d: &Diagnostic) -> String {
    let mut edits = d.fix.as_ref().expect("fix").edits.clone();
    edits.sort_by_key(|e| std::cmp::Reverse(e.start));
    let mut out = source.to_string();
    for e in edits {
        out.replace_range(e.start as usize..e.end as usize, &e.text);
    }
    out
}

fn flagged<'s>(source: &'s str, d: &Diagnostic) -> &'s str {
    &source[d.start as usize..d.end as usize]
}

// ---- W050: raw listeners, intervals and sockets without cleanup -------------------------------------------------

#[test]
fn w050_listener_without_cleanup_is_fixed_to_on() {
    let src = "import { state } from 'weft'\nexport function Dialog() {\n  const open = state(true)\n  window.addEventListener('keydown', e => { if (e.key === 'Escape') open.value = false })\n  return <div>{open.value}</div>\n}";
    let d = check(src);
    let w = one(&d, "W050");
    assert_eq!(w.severity, Severity::Error);
    assert!(flagged(src, w).starts_with("window.addEventListener('keydown'"));
    assert!(w.message.contains("never removed"), "{}", w.message);
    let fixed = apply_fix(src, w);
    assert!(fixed.contains("import { state } from 'weft'\nimport { on } from 'weft/browser'\n"), "{fixed}");
    assert!(fixed.contains("on(window, 'keydown', e => { if (e.key === 'Escape') open.value = false })"), "{fixed}");
    assert!(!has(&check(&fixed), "W050"), "{:?}", check(&fixed));
    assert!(!has(&check(&fixed), "W051"));
}

#[test]
fn w050_fix_keeps_options_and_reuses_the_import() {
    let src = "import { online as isUp, on as listen } from 'weft/browser'\nexport function A() {\n  document.addEventListener('scroll', onScroll, { passive: true })\n  return <p />\n}\nfunction onScroll() {}";
    let fixed = apply_fix(src, one(&check(src), "W050"));
    assert!(fixed.contains("listen(document, 'scroll', onScroll, { passive: true })"), "{fixed}");
    assert_eq!(fixed.matches("weft/browser").count(), 1, "{fixed}");
}

#[test]
fn w050_fix_extends_an_existing_weft_browser_import() {
    let src = "import { online } from 'weft/browser'\nexport function A() {\n  const o = online()\n  addEventListener('resize', () => {})\n  return <p>{o.value}</p>\n}";
    let fixed = apply_fix(src, one(&check(src), "W050"));
    assert!(fixed.starts_with("import { online, on } from 'weft/browser'"), "{fixed}");
    assert!(fixed.contains("on(window, 'resize', () => {})"), "{fixed}");
}

#[test]
fn w050_interval_is_fixed_to_interval() {
    let src = "import { state } from 'weft'\nexport function Clock() {\n  const now = state(Date.now())\n  setInterval(() => { now.value = Date.now() }, 1000)\n  return <p>{now.value}</p>\n}";
    let d = check(src);
    let w = one(&d, "W050");
    let fixed = apply_fix(src, w);
    assert!(fixed.contains("interval(1000, () => { now.value = Date.now() })"), "{fixed}");
    assert!(fixed.contains("import { interval } from 'weft/browser'"), "{fixed}");
    assert!(check(&fixed).iter().all(|d| d.code != "W050" && d.code != "W051"), "{:?}", check(&fixed));
}

#[test]
fn w050_not_when_cleaned_up() {
    let src = "import { onCleanup } from 'weft'\nexport function A() {\n  const f = () => {}\n  window.addEventListener('keydown', f)\n  onCleanup(() => window.removeEventListener('keydown', f))\n  const id = setInterval(f, 10)\n  onCleanup(() => clearInterval(id))\n  const ws = new WebSocket('/x')\n  onCleanup(() => ws.close())\n  return <p />\n}";
    assert!(!has(&check(src), "W050"), "{:?}", check(src));
}

#[test]
fn w050_removing_another_type_does_not_count() {
    let src = "export function A() {\n  window.addEventListener('keydown', f)\n  window.removeEventListener('keyup', f)\n  return <p />\n}\nfunction f() {}";
    assert_eq!(only(&check(src), "W050").len(), 1);
}

#[test]
fn w050_sockets_have_no_fix() {
    let src = "export function Feed() {\n  const ws = new WebSocket('/feed')\n  const es = new EventSource('/events')\n  return <p />\n}";
    let d = check(src);
    let w = only(&d, "W050");
    assert_eq!(w.len(), 2, "{d:?}");
    assert!(w.iter().all(|d| d.fix.is_none()));
    assert!(w[0].message.contains("`new WebSocket(…)`"), "{}", w[0].message);
}

#[test]
fn w050_only_in_components() {
    let src = "window.addEventListener('keydown', () => {})\nsetInterval(() => {}, 10)\nexport function helper() { window.addEventListener('scroll', () => {}) }";
    assert!(!has(&check(src), "W050"), "{:?}", check(src));
}

#[test]
fn w050_in_a_handler_has_no_fix() {
    // `on` there would have no owner (W051), so the fix would be wrong.
    let src =
        "export function A() {\n  return <button onClick={() => window.addEventListener('keydown', () => {})}>x</button>\n}";
    let d = check(src);
    let w = one(&d, "W050");
    assert!(w.fix.is_none());
}

#[test]
fn w050_no_fix_when_on_is_taken() {
    let src = "export function A() {\n  const on = 1\n  window.addEventListener('keydown', () => {})\n  return <p>{on}</p>\n}";
    assert!(one(&check(src), "W050").fix.is_none());
}

// ---- W051: created outside an owner ------------------------------------------------------------------------------

#[test]
fn w051_at_module_scope() {
    let src = "import { online, interval } from 'weft/browser'\nexport const up = online()\ninterval('1s', () => {})";
    let d = check(src);
    let w = only(&d, "W051");
    assert_eq!(w.len(), 2, "{d:?}");
    assert!(w[0].message.contains("`online(…)` is created at module scope"), "{}", w[0].message);
    assert_eq!(flagged(src, w[0]), "online()");
    assert!(w[0].fix.is_none());
}

#[test]
fn w051_in_timers_promises_handlers_and_after_await() {
    let src = "import { onMount } from 'weft'\nimport { on, media, online, interval } from 'weft/browser'\nexport function A() {\n  setTimeout(() => online(), 10)\n  fetch('/x').then(() => interval(10, () => {}))\n  onMount(async () => { await fetch('/y'); on(window, 'keydown', () => {}) })\n  return <button onClick={() => media('(x)', { ssr: false })}>x</button>\n}";
    let d = check(src);
    let msgs: Vec<&str> = only(&d, "W051").iter().map(|d| d.message.as_str()).collect();
    assert_eq!(msgs.len(), 4, "{d:#?}");
    assert!(msgs[0].contains("in a timer callback"), "{}", msgs[0]);
    assert!(msgs[1].contains("in a promise callback"), "{}", msgs[1]);
    assert!(msgs[2].contains("after `await`"), "{}", msgs[2]);
    assert!(msgs[3].contains("in an event handler"), "{}", msgs[3]);
}

#[test]
fn w051_not_in_owned_places() {
    let src = "import { createRoot, defineState, onMount, watch, state } from 'weft'\nimport { on, online, visible, interval } from 'weft/browser'\nexport const net = defineState('net', () => ({ up: online() }))\nconst stop = createRoot(dispose => { on(window, 'resize', () => {}); return dispose })\nexport function A() {\n  const v = visible()\n  const s = state(0)\n  onMount(() => { interval('1s', () => {}) })\n  watch(() => s.value, () => { on(document, 'click', () => {}) })\n  ;[1, 2].forEach(() => online())\n  return <p>{v.value}</p>\n}\nexport function useUp() { return online() }";
    let d = check(src);
    assert!(only(&d, "W051").is_empty(), "{d:#?}");
}

#[test]
fn w051_only_for_weft_browser() {
    let src = "function online() { return 1 }\nexport const up = online()";
    assert!(!has(&check(src), "W051"));
}

// ---- W054: media without a server value ------------------------------------------------------------------------

#[test]
fn w054_media_without_ssr_in_check_mode_is_a_warning_with_an_edit() {
    let src = "import { media } from 'weft/browser'\nexport function A() {\n  const dark = media('(prefers-color-scheme: dark)')\n  return <p>{dark.value ? 'dark' : 'light'}</p>\n}";
    let d = check(src);
    let w = one(&d, "W054");
    assert_eq!(w.severity, Severity::Warning);
    assert_eq!(flagged(src, w), "media('(prefers-color-scheme: dark)')");
    assert!(!w.fix.as_ref().unwrap().safe);
    let fixed = apply_fix(src, w);
    assert!(fixed.contains("media('(prefers-color-scheme: dark)', { ssr: false })"), "{fixed}");
    assert!(!has(&check(&fixed), "W054"));
}

#[test]
fn w054_is_an_error_in_server_rendered_output_and_off_for_client_only() {
    let src = "import { media } from 'weft/browser'\nexport function A() {\n  const wide = media('(min-width: 800px)')\n  return <p>{wide.value ? 'wide' : 'narrow'}</p>\n}";
    assert_eq!(one(&with(src, "ssr", false), "W054").severity, Severity::Error);
    assert_eq!(one(&with(src, "dom", true), "W054").severity, Severity::Error);
    assert!(!has(&with(src, "dom", false), "W054"));
}

#[test]
fn w054_options_objects() {
    let base = "import { media } from 'weft/browser'\nexport function A(props: any) {\n  const m = media('(x)', OPTS)\n  return <p>{m.value}</p>\n}";
    let run = |opts: &str| check(&base.replace("OPTS", opts));
    assert!(!has(&run("{ ssr: true }"), "W054"));
    assert!(!has(&run("props.opts"), "W054"));
    assert!(!has(&run("{ ...props.opts }"), "W054"));
    let src = base.replace("OPTS", "{}");
    assert!(apply_fix(&src, one(&check(&src), "W054")).contains("media('(x)', { ssr: false })"));
    let src = base.replace("OPTS", "{ other: 1 }");
    assert!(apply_fix(&src, one(&check(&src), "W054")).contains("media('(x)', { ssr: false, other: 1 })"));
}

#[test]
fn w054_not_for_values_with_a_server_default() {
    let src = "import { online, visible, lifecycle } from 'weft/browser'\nexport function A() {\n  const o = online(), v = visible(), l = lifecycle()\n  return <p>{o.value} {v.value} {l.value}</p>\n}";
    assert!(!has(&with(src, "ssr", true), "W054"));
}

// ---- W056: watch copying a live value into state -----------------------------------------------------------------

#[test]
fn w056_watch_copies_a_live_value() {
    for run in ["v => { up.value = v }", "v => up.value = v", "() => { up.value = isOnline.value }"] {
        let src = format!(
            "import {{ state, watch }} from 'weft'\nimport {{ online }} from 'weft/browser'\nexport function A() {{\n  const isOnline = online()\n  const up = state(true)\n  watch(() => isOnline.value, {run})\n  return <p>{{up.value}}</p>\n}}"
        );
        let d = check(&src);
        let w = one(&d, "W056");
        assert_eq!(w.severity, Severity::Warning);
        assert!(w.message.contains("copies the live value `isOnline` into `up`"), "{}", w.message);
        assert!(w.help.contains("derived(() => isOnline.value)"), "{}", w.help);
    }
}

#[test]
fn w056_live_queries_count_too() {
    let src = "import { state, watch } from 'weft'\nexport function A(props: any) {\n  const todos = listTodos.live({ id: props.id })\n  const copy = state([])\n  watch(() => todos.value, v => { copy.value = v })\n  return <p>{copy.value.length}</p>\n}";
    one(&check(src), "W056");
}

#[test]
fn w056_not_for_state_sources_or_transforms() {
    let src = "import { state, watch } from 'weft'\nimport { online } from 'weft/browser'\nexport function A() {\n  const a = state(0)\n  const b = state(0)\n  const isOnline = online()\n  const off = state(false)\n  watch(() => a.value, v => { b.value = v })\n  watch(() => isOnline.value, v => { off.value = !v })\n  watch(() => isOnline.value, v => { if (!v) console.log('offline') })\n  return <p>{b.value} {off.value}</p>\n}";
    assert!(!has(&check(src), "W056"), "{:?}", check(src));
}

// ---- browser values are boxes for the other checks ---------------------------------------------------------------

#[test]
fn browser_values_are_boxes() {
    let src = "import { online } from 'weft/browser'\nexport function A() {\n  const isOnline = online()\n  const label = isOnline.value ? 'up' : 'down'\n  return <p>{isOnline}{label}</p>\n}";
    let d = check(src);
    one(&d, "W001");
    one(&d, "W015");
}
