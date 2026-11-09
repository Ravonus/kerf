# Design: tokens, primitives, D-codes

An app with warp has one design language: `@weft-js/warp`'s primitives and components, on warp's tokens. Name what a thing
is, and the look follows the theme, the dials and the density.

```tsx
import {
  Button,
  Card,
  Heading,
  Input,
  Row,
  Stack,
  Text,
} from '@weft-js/warp'

export function Billing() {
  return (
    <Stack as="section" gap="section">
      <Heading level={1} role="title">Billing</Heading>
      <Card title="Card on file">
        <Stack gap="related">
          <Text subtle>Visa ending 4242</Text>
          <Input label="Billing email" type="email" />
          <Row gap="tight" justify="end">
            <Button emphasis="ghost">Cancel</Button>
            <Button>Save</Button>
          </Row>
        </Stack>
      </Card>
    </Stack>
  )
}
```

## Vocabulary

| Thing | Use |
|---|---|
| Vertical flow | `Stack gap align divided` |
| Horizontal cluster | `Row gap justify align wrap reflow` (`reflow` stacks it below a width step) |
| Columns | `Grid min cols gap` |
| Side + main | `Split side width at gap` |
| Measured column | `Center max gutter intrinsic` |
| Full-screen, one centred child | `Cover`, with `data-part="center"` on the child |
| Media box | `Frame ratio` |
| Push to the far end | `Spacer` |
| Sunken region | `Inset pad` |
| Raised box | `Card` (warp's surface: `<Surface>` is weft's canvas) |
| Heading | `Heading level role`: `level` is the outline and picks the look (`title` for h1, `heading` for h2 and h3, `label` below); `role` overrides it |
| Text | `Text role tone subtle faint inline` |
| Link | `Link href subtle external`; a bare `<a>` still gets warp's colour |

`gap`: `none hair tight related group section page`, a relationship and not a size: `related` inside a thing, `group`
between things, `section` between sections. `as` picks the element: `div section article main header footer nav aside
form ul ol`. There are no breakpoint props, since boxes answer to their container. `@weft-js/core/ds` exports these names as
constants and types.

`style={{ … }}` and `class` still work; the D-codes below tell you when they leave the system. For a named look of your
own, use a style group (`weft docs style`), not a class list.

## D-codes

`weft check` reports them. `weft fix` applies the safe autofixes. A fix that changes an element is a suggested edit in
`fix.edits`; a raw colour has none, since a token follows the theme and the raw value didn't.

Where the app has warp's tokens (`@weft-js/warp` in package.json; headless `@weft-js/warp-core` ships none):

| Code | Catches | Fix |
|---|---|---|
| D001 | Raw colour, palette class | A token or `tone` |
| D002 | Spacing off the scale, or a step by hand | Autofix when exactly a step |
| D003 | Raw type, radius, shadow | `Heading`, `Text`, radius and elevation tokens; autofix for an exact radius |
| D004 | Layout spelled out on an element | `Stack`, `Row` (suggested edit) |
| D040 | The style gate (`data-weft="styled"`) on main content or an h1 | A secondary part, or no marker |
| D005 | A browser-painted control: `<button>`, `<select>`, `<textarea>`, an input type such as `date`, `number` or `range`, or a `title` tooltip | The warp component (suggested edit for a button) |
| D006 | One heading level at two roles across the app, or a bare `<hN>` beside `<Heading>` | Match the level's main role (suggested edit at each site) |
| D007 | A bare `<a href>` | `<Link>`, or `Shell`'s `nav` (suggested edit) |

In every app:

| Code | Catches | Fix |
|---|---|---|
| D011 | A literal colour pair below 4.5:1 | Tokens, or better colours |
| D030 | A form control with no label | `<label>`, `aria-label`, warp's `label` |
| D031 | A button or link with no name | Text, `aria-label`, warp's `label` |
| D032 | `<img>` with no `alt` | Describe it; `alt=""` for decoration |
| D033 | `onClick` on a non-interactive element | `<button type="button">` (suggested edit) |
| D034 | A control inside a control | One control |
| D035 | A heading level that jumps | The next level |
| D036 | Focus ring removed | Remove the override, or add a `focus-visible:` style |
| D037 | Positive `tabindex` | `0` (autofix) |
| D038 | Two solid Buttons side by side | One primary action per region |
| D039 | `<html>` with no `lang` | Set it |

D010 is warp's contrast gate on the seed and tokens: `weft build` stops on it. D012 is a CSP that blocks the inlined CSS. D020–D025 are style groups.

`// weft-allow D001: <reason>` on the line above keeps one site; the reason is required. `check: { design: false }` in
the config turns these off.

## Tokens

Configure the theme with `warp()`: seeds and checked token overrides set the app-wide look. Named hex colours and colour-only palettes provide another path. Root Button `bg` and `text` can be set together without named palettes. System and other part settings are not supported yet. The generated [token reference](theme-tokens.md) lists candidate coverage, including unresolved rows. `weft docs theme`
has worked looks and the button channels. `weft tokens`
writes the resolved tokens to `.weft/tokens/` as DTCG 2025.10, one file per theme × expression plus a resolver, for
Figma, Style Dictionary or Terrazzo.
