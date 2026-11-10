// What every page of an app with lazy islands carries inline, so nothing done before the code arrives is lost (PLAN §11). An element
// with `wk` that hasn't been claimed (no `$k`) belongs to code that isn't there: its events go in `q` in order, and
// `start()` replays them. A click, submit or reset waits with its default held, and the replay is what acts, so a page
// whose code never comes just runs the defaults late. Everything else (typing, focus) has already happened in the DOM.
// A modified click on a link is the browser's (a new tab), and stays out of it.
//
//   q  the events    n  the page needs its code at once    w  wake: (element, lead), a lead being only a hint of intent
//   p  replay one    r  replaying, so don't capture        d  the visitor asked for less data      l  the last lead
//
// Written by hand and small, since every such page pays it: `boot.ts` and weft's `island.ts` are the other two halves.

const CODE = `(n=>{var d=document,c=navigator.connection,q=window.__wq={q:[],n:n,w(){},d:matchMedia("(prefers-reduced-data: reduce)").matches||!!(c&&c.saveData),p(e){var t=e.target,r=q.r,s=e.submitter;if(t.isConnected){q.r=1;try{e.type=="submit"?t.requestSubmit(s&&s.isConnected?s:void 0):e.type=="reset"?t.reset():t.dispatchEvent(new e.constructor(e.type,e))}finally{q.r=r}}}},o=t=>t.closest&&t.closest("[wk]"),h=e=>{var k=!q.r&&o(e.target);if(k&&(!k.$k||q.q.length)&&!((e.metaKey||e.ctrlKey||e.shiftKey)&&e.type=="click"&&e.target.closest("a"))){q.q.push(e);/^(click|submit|reset)$/.test(e.type)&&e.preventDefault();q.w(k)}},l=e=>{var k=o(e.target);k&&!k.$k&&!q.d&&q.w(k,1)};"click dblclick pointerdown pointerup mousedown mouseup keydown keyup input change submit reset focus blur focusin focusout".split(" ").forEach(t=>d.addEventListener(t,h,!0));"pointerover touchstart".split(" ").forEach(t=>d.addEventListener(t,l,{capture:!0,passive:!0}))})`

/** The script's text. `now`: the page has work that can't wait, so its code loads straight away. */
export const capture = (now: boolean) => `${CODE}(${now ? 1 : 0})`

/**
 * A page that runs no client until it's needed follows its links with full loads, so the browser prefetches the one the
 * pointer rests on (`moderate`). Not a prerender, which would run the next page's code unseen. An island's links go
 * through the router once its code comes, so they're left out, as is `/_weft/` and anything under `data-preload="off"`;
 * `start()` takes the rules down when the router takes over, so nothing is fetched twice.
 */
const RULES = JSON.stringify({
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: '/_weft/*' } },
          {
            not: {
              selector_matches:
                '[wk] a, a[wk], [data-preload="off"] a, a[data-preload="off"], a[download]',
            },
          },
        ],
      },
      eagerness: 'moderate',
    },
  ],
})

/** The rules, for a page whose code waits (`now` false, nothing streaming). */
export const speculate = (shape: { now: boolean; streaming?: boolean }) =>
  shape.now || shape.streaming
    ? ''
    : `<script type="speculationrules" id="weft-speculate">${RULES}</script>\n`
