<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">patches</h1>

<p align="center">
  <strong>Small pnpm patches to third-party dependencies, each with the reason it exists.</strong><br>
  Today there is one: a single line in playwright-core so WebKit runs on macOS 14.
</p>

<p align="center">
  <a href="../pnpm-workspace.yaml">pnpm-workspace.yaml</a> ·
  <a href="../scripts">Scripts</a> ·
  <a href="../CONTRIBUTING.md">Contributing</a>
</p>

> [!NOTE]
> These patches apply only inside this workspace. They are not shipped in any `@weft-js/*` package and do not affect apps.

## How patches are applied

pnpm applies each patch on install. The list lives in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml):

```yaml
patchedDependencies:
  playwright-core@1.64.1: patches/playwright-core@1.64.1.patch
```

A patch is tied to an exact version. If playwright-core moves past `1.64.1`, the entry no longer matches, and the patch
must be redone against the new version or dropped.

## `playwright-core@1.64.1.patch`

### The problem

Playwright 1.64's WebKit build for macOS 14 is frozen: Playwright no longer updates it. That older WebKit doesn't know
the `PushAPIEnabled` page setting, and playwright-core 1.64.1 sends that setting when it creates every new page. WebKit
rejects it, so every new page fails, and every WebKit test waits until its timeout.

The release gate (`pnpm run check --release`) runs WebKit, and the machine that runs it is on macOS 14.

### The change

One line in `lib/coreBundle.js`, in WebKit's page setup (`init_wkPage`). The `PushAPIEnabled` override gets a
`.catch(() => {})`, so if WebKit rejects that one setting, page creation carries on:

```js
// weft: the frozen macOS 14 WebKit build predates this setting and rejects it, which fails every new page.
promises2.push(session.send("Page.overrideSetting", { setting: "PushAPIEnabled", value: !contextOptions.isMobile }).catch(() => {}));
```

Every other setting in that block is unchanged, and on a WebKit that accepts the setting nothing changes.

### History

It came in with commit `b739ea14` ("Release gate runs WebKit on macOS 14", 2026-11-07). The commit message says that,
with the patch, WebKit passes the warp overlay suite on the release machine (76 tests). The same commit changed
`check --release` so it no longer skips WebKit when WebKit can't open a page. It now fails at once with the reason
instead.

### What checks it

[`scripts/check/webkit.mjs`](../scripts/check/webkit.mjs) runs before `pnpm run check --release`. It launches WebKit
through the playwright-core that `packages/start` resolves, opens a page and reads it back within 30 seconds. If that
fails, the check stops with `webkit FAIL: <reason>` instead of letting each WebKit test time out.

## Adding or updating a patch

```sh
pnpm patch <package>@<version>          # opens an editable copy
# edit the files it points to
pnpm patch-commit <the path it printed>  # writes patches/<package>@<version>.patch and the workspace entry
```

Keep each patch as small as the fix, mark changed lines with a `// weft:` comment saying why, and add a comment above the
entry in `pnpm-workspace.yaml` as the existing one has. Then update this README.

## License

The patch modifies playwright-core, which is Apache-2.0. The rest of this repository is MIT; see [LICENSE](../LICENSE).
