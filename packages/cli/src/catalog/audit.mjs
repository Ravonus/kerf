/** audit diagnostic entries in catalog order. */
export const audit = [
  // The rendered page (`kerf audit`, and the end of `kerf build`): what Lighthouse, a crawler and a screen reader see
  {
    code: 'L000',
    severity: 'warning',
    by: 'cli',
    catches:
      "The built pages weren't audited: no Chrome or Chromium on this machine, or no prerendered pages",
    fix: 'Install Chrome, or set `KERF_CHROME`; `kerf audit --url <deploy>` audits a running site',
  },
  {
    code: 'L001',
    severity: 'error',
    by: 'cli',
    catches:
      "A control (button, link, field, frame) with no accessible name in the rendered page, at a phone's width or a desktop's: often CSS that hid its only text",
    fix: 'Give it a name: `label` on a veneer `Button` or `aria-label` on an element. For a button that shows its text on wide screens, `collapse="phone"` (or `"tablet"`) hides the text there and keeps it as the name; `display: none` takes the name with it.',
  },
  {
    code: 'L002',
    severity: 'error',
    by: 'cli',
    catches: 'An image with no text alternative in the rendered page',
    fix: '`alt` on an `<img>` (`alt=""` if it shows nothing a reader needs), `label` on veneer\'s `Icon` and `Image`.',
  },
  {
    code: 'L003',
    severity: 'error',
    by: 'cli',
    catches:
      'Text under WCAG contrast (4.5:1, or 3:1 when large) against what is actually behind it in the rendered page',
    fix: "Text needs 4.5:1 against what is behind it (3:1 at 24px, or 18.7px bold). Use veneer's text roles (`--veneer-color-text`, `--veneer-color-text-subtle`) on veneer surfaces instead of a raw or faded colour.",
  },
  {
    code: 'L004',
    severity: 'error',
    by: 'cli',
    catches:
      'Another axe-core WCAG A/AA rule the rendered page breaks (the rule Lighthouse runs for Accessibility and Agentic Browsing)',
    fix: "Each finding names the axe rule, its first remedy and the rule's page.",
  },
  {
    code: 'L010',
    severity: 'error',
    by: 'cli',
    catches: 'An uncaught exception or a `console.error` while the page loads',
    fix: 'Fix the error the page throws or logs; `kerf browser open <route>` then `kerf browser snapshot` shows it with the page.',
  },
  {
    code: 'L011',
    severity: 'error',
    by: 'cli',
    catches: 'The browser logged an error loading the page: usually a missing file (404)',
    fix: 'Usually a file the page asks for that is missing (a 404): fix the URL or ship the file.',
  },
  {
    code: 'L012',
    severity: 'error',
    by: 'cli',
    catches: 'A deprecated browser API in use (Lighthouse Best Practices)',
    fix: "Replace the deprecated API; Chrome's message names what replaces it.",
  },
  {
    code: 'L013',
    severity: 'error',
    by: 'cli',
    catches:
      'An issue Chrome logs and Lighthouse counts: mixed content, a blocked cookie, a CSP or CORS failure',
    fix: 'Open the page in Chrome and read the Issues panel for the request or element it names.',
  },
  {
    code: 'L020',
    severity: 'error',
    by: 'cli',
    catches: 'A built page with no `<title>`',
    fix: '`meta: { title }` on the route, or `site.title` in kerf.config.ts.',
  },
  {
    code: 'L021',
    severity: 'warning',
    by: 'cli',
    catches: 'A built page with no meta description',
    fix: '`meta: { description }` on the route, or `site.description` in kerf.config.ts.',
  },
  {
    code: 'L022',
    severity: 'error',
    by: 'cli',
    catches: '`<html>` with no `lang`',
    fix: '`site.locale` in kerf.config.ts sets it.',
  },
  {
    code: 'L023',
    severity: 'error',
    by: 'cli',
    catches: 'No `width=device-width` viewport meta: phones render at 980px and shrink the page',
    fix: 'kerf writes it; a custom `head` or document must keep it.',
  },
  {
    code: 'L024',
    severity: 'warning',
    by: 'cli',
    catches:
      'A page told search engines not to index it through markup or HTTP headers; an error when public indexing is expected',
    fix: 'Choose indexing intent with `build.audit.indexing` or `kerf audit --indexing public|private`. For public search, remove noindex from both the page and host/proxy, then audit the production URL. Preserve intentional private exclusions.',
  },
  {
    code: 'L025',
    severity: 'error',
    by: 'cli',
    catches: 'A page answered with a 4xx or 5xx status',
    fix: 'The route errors or is missing: run it with `kerf dev` and read the server log.',
  },
  {
    code: 'L030',
    severity: 'warning',
    by: 'cli',
    catches: "The page scrolls sideways at a phone's width",
    fix: 'Let the named element shrink: `max-inline-size: 100%`, `min-inline-size: 0` on a flex or grid child, or `overflow-x: auto` on wide content, with `tabindex="0"`, a role and a name so a keyboard can scroll it (veneer\'s `Table` does this).',
  },
  {
    code: 'L031',
    severity: 'warning',
    by: 'cli',
    catches: 'The layout moved while the page loaded (CLS over 0.05; an error over 0.1)',
    fix: "Reserve the space before it fills: `width` and `height` on images and video, a fixed `block-size` for what loads late, and fonts through kerf's text() plugin (it matches fallback metrics).",
  },
]
