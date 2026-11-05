// Exercise reported diagnostics and their repaired forms through the compiler.
#[test]
fn catalog_browser_diagnostics_have_quiet_repairs() {
    let cases = [
        (
            "W050",
            "export function A() { window.addEventListener('keydown', () => {}); return <p /> }",
            "import { on } from '@weft-js/core/browser'; export function A() { on(window, 'keydown', () => {}); return <p /> }",
        ),
        (
            "W051",
            "import { online } from '@weft-js/core/browser'; export const up = online()",
            "import { online } from '@weft-js/core/browser'; export function A() { const up = online(); return <p>{up.value}</p> }",
        ),
        (
            "W052",
            "import { state, watch } from '@weft-js/core'; import { prices } from '../server/prices'; export function A() { const tick = prices({}); const list = state([]); watch(() => tick.value, m => { list.value = [...list.value, m] }); return <p>{list.value.length}</p> }",
            "import { state, watch } from '@weft-js/core'; import { format } from './format'; export function A() { const tick = format(1); const list = state([]); watch(() => tick.value, m => { list.value = [...list.value, m] }); return <p>{list.value.length}</p> }",
        ),
        (
            "W054",
            "import { media } from '@weft-js/core/browser'; export function A() { const dark = media('(x)'); return <p>{dark.value}</p> }",
            "import { media } from '@weft-js/core/browser'; export function A() { const dark = media('(x)', { ssr: false }); return <p>{dark.value}</p> }",
        ),
        (
            "W056",
            "import { state, watch } from '@weft-js/core'; import { online } from '@weft-js/core/browser'; export function A() { const live = online(); const up = state(true); watch(() => live.value, v => { up.value = v }); return <p>{up.value}</p> }",
            "import { online } from '@weft-js/core/browser'; export function A() { const live = online(); return <p>{live.value}</p> }",
        ),
        (
            "W060",
            "import { group } from '@weft-js/core/style'; const px = 13; export const g = group('g', { base: { pad: px } })",
            "import { group } from '@weft-js/core/style'; export const g = group('g', { base: { pad: 13 } })",
        ),
    ];
    fn covered(case: (&str, &str, &str), code: &str) -> bool {
        let (_, bad, repaired) = case;
        let options = Options {
            filename: "App.tsx".into(),
            check_only: true,
            ..Default::default()
        };
        let found = compile(bad, &options).diagnostics;
        let quiet = compile(repaired, &options).diagnostics;
        codes(&found).contains(&code) && !codes(&quiet).contains(&code)
    }
    assert!(covered(cases[0], "W050"));
    assert!(covered(cases[1], "W051"));
    assert!(covered(cases[2], "W052"));
    assert!(covered(cases[3], "W054"));
    assert!(covered(cases[4], "W056"));
    assert!(covered(cases[5], "W060"));
}
