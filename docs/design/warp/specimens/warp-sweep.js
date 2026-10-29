/* warp-sweep.js · the one sweep phase machine every specimen loads.
   What weft's sweep() does (SIGNATURE §1.4, §1b, §4). warp.css (@layer
   warp.signature) draws everything; this only writes host[data-phase]:
     active            → "in"   (from "out": "idle", one style flush, then "in",
                                  so every entry draws left to right)
     inactive, "in"    → "out"  (the sweep keeps travelling left to right)
     "out" + transitionend on the travelling part, or a ms+150 backstop → "idle"
     duration 0 (reduced motion, data-motion="reduce") → straight to "idle"
   Active = hover (not touch)
          | focus: :focus-within for fields and the composer, :focus-visible elsewhere
          | held: data-pin, data-hold, aria-expanded=true, aria-pressed=true,
            data-state=open, :popover-open, an open field ([data-open])
          | a touch tap (data-touch-effect, shown for one sweep)
          | a one-shot confirm()
   Hosts are [data-sweep]. data-static hosts are frozen demo states: never touched.
   The trigger (the area that counts as hover/focus) is the host, or the nearest
   [data-sweep-trigger] / checkbox, radio or switch <label> around it.
   window.warpSweep = { init(scope), sync(el), pin(el, on), confirm(el), duration(el), label(labelEl) }
   label(labelEl) splits a field label into the shared two-part anatomy (01 §2) and returns its letter spans.
   duration(el) is cached per (expression, motion, OS reduced motion, host kind): no style recalc per call. */
(() => {
  "use strict";
  const HOST = "[data-sweep]";
  const TRIGGER = '[data-sweep-trigger], label[data-scope="checkbox"], label[data-scope="radio"], label[data-scope="switch"]';
  const WITHIN = '[data-scope="field"] > [data-part="control"], [data-scope="field"][data-sweep], [data-scope="composer"], [data-part="input-row"], [data-sweep-focus="within"]';
  const HELD = '[data-pin], [data-hold], [aria-expanded="true"], [aria-pressed="true"], [data-state="open"]';
  const HELD_CHILD = ':scope > [aria-expanded="true"], :scope > [data-part="heading"] [aria-expanded="true"], :scope > [data-part="input"][aria-expanded="true"], :scope > [data-part="trigger"][aria-expanded="true"]';
  const hovered = new WeakSet(), touched = new WeakSet(), confirming = new WeakSet(), timers = new WeakMap();

  const live = (h) => h.isConnected && h.matches(HOST) && !h.hasAttribute("data-static");
  const trig = (h) => h.parentElement?.closest(TRIGGER) || h;
  const popOpen = (el) => { try { return el.matches(":popover-open"); } catch { return false; } };
  // every host a node belongs to: its host ancestors, plus the hosts a trigger ancestor owns
  function hostsAt(node) {
    const out = new Set();
    for (let n = node?.nodeType === 1 ? node : node?.parentElement; n; n = n.parentElement) {
      if (n.matches(HOST)) out.add(n);
      if (n.matches(TRIGGER)) for (const h of n.querySelectorAll(HOST)) if (trig(h) === n) out.add(h);
    }
    return [...out].filter(live);
  }

  // the part whose transition ends "out": the stroke, the frame's corners, the fill, or the rail's inner sweep
  function travel(h) {
    return h.querySelector(':scope > [data-part="sweep"], :scope > [data-part="sweep-corners"]') ||
      h.querySelector(':scope > [data-part="sweep-fill"], :scope > [data-part="icon"] > [data-part="sweep"]') ||
      [...h.querySelectorAll('[data-part="rail-hover"]')].find((p) => p.closest(HOST) === h) || null;
  }
  const secs = (list) => Math.max(0, ...list.split(",").map((v) => parseFloat(v) * (/ms\s*$/.test(v) ? 1 : 1000) || 0));
  // the real duration, read from the part that travels (never by parsing the calc() custom property).
  // At idle the part has transition: none, so then resolve the same token through a probe in the host.
  // Reading it forces a style recalc, so it is cached by what the duration depends on: the nearest
  // expression and motion scopes, the OS reduced-motion setting, and the host kind (the frame button runs
  // on --warp-frame-duration). Attribute reads don't recalc style. A page that overrides
  // --warp-sweep-duration inline on a host opts out with data-sweep-duration="live".
  const cache = new Map();
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  reduceMQ.addEventListener?.("change", () => cache.clear());
  const keyOf = (el) => {
    if (!el?.closest || el.closest('[data-sweep-duration="live"]')) return null;
    const kind = el.matches?.(HOST) ? (el.querySelector(':scope > [data-part="sweep-outline"]') ? "frame" : "sweep") : "token";
    return [el.closest("[data-expression]")?.dataset.expression ?? "", el.closest("[data-motion]")?.dataset.motion ?? "", reduceMQ.matches ? 1 : 0, kind].join("|");
  };
  function measure(el) {
    const p = el && (el.matches?.(HOST) ? travel(el) : null);
    if (p && getComputedStyle(p).transitionProperty !== "none") return secs(getComputedStyle(p).transitionDuration);
    const t = document.createElement("i"); t.style.cssText = "position:absolute;visibility:hidden;transition-duration:var(--warp-sweep-duration)";
    (el || document.body).append(t); const v = secs(getComputedStyle(t).transitionDuration); t.remove(); return v;
  }
  function duration(el) {
    const k = keyOf(el || document.body);
    if (k === null) return measure(el);
    if (!cache.has(k)) cache.set(k, measure(el));
    return cache.get(k);
  }

  function active(h) {
    if (hovered.has(h) || touched.has(h) || confirming.has(h)) return true;
    const t = trig(h);
    if (h.matches(HELD) || (t !== h && t.matches(HELD)) || popOpen(h) || h.querySelector(HELD_CHILD)) return true;
    if (h.closest('[data-scope="field"][data-open], [data-sweep][data-open=""]')) return true;
    return h.matches(WITHIN) ? h.matches(":focus-within") : t.matches(":focus-visible, :has(:focus-visible)");
  }
  const idle = (h) => { if (h.dataset.phase === "out") h.dataset.phase = "idle"; };

  // one attribute write per change
  function step(h) {
    if (!live(h)) return;
    clearTimeout(timers.get(h));
    if (active(h)) {
      if (h.dataset.phase === "in") return;
      if (h.dataset.phase === "out") { h.dataset.phase = "idle"; void h.offsetWidth; }   // restart from the left
      h.dataset.phase = "in";
      return;
    }
    if (h.dataset.phase !== "in") { if (!h.dataset.phase) h.dataset.phase = "idle"; return; }
    h.dataset.phase = "out";
    const ms = duration(h);
    if (!ms) idle(h); else timers.set(h, setTimeout(() => idle(h), ms + 150));   // backstop for transitionend
  }
  // sync(el): a host, or every host inside a container
  function sync(el) {
    if (!el) return;
    if (el.matches?.(HOST)) step(el);
    else el.querySelectorAll?.(HOST).forEach(step);
  }
  function init(scope = document) {
    const list = scope.matches?.(HOST) ? [scope] : [];
    list.push(...(scope.querySelectorAll?.(HOST) || []));
    for (const h of list) if (!h.hasAttribute("data-static")) { if (!h.dataset.phase) h.dataset.phase = "idle"; step(h); }
  }
  const pin = (el, on) => { if (!el) return; el.toggleAttribute("data-pin", on); sync(el); };
  // confirm(el): one full pass, in then out, as feedback (message sent, saved, copied).
  // data-confirm is set for the pass so CSS can show it on dial-gated hosts (--_on: 1).
  function confirm(el) {
    if (!el || !live(el)) return;
    clearTimeout(el._warpConfirm);
    confirming.add(el); el.setAttribute("data-confirm", ""); step(el);
    el._warpConfirm = setTimeout(() => {
      confirming.delete(el); step(el);
      el._warpConfirm = setTimeout(() => el.removeAttribute("data-confirm"), duration(el) + 150);
    }, duration(el));
  }

  // -- events: delegated once for the whole document
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    for (const h of hostsAt(e.target)) if (!hovered.has(h)) { hovered.add(h); step(h); }
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    for (const h of hostsAt(e.target)) {
      if (!hovered.has(h) || (e.relatedTarget && trig(h).contains(e.relatedTarget))) continue;
      hovered.delete(h); step(h);
    }
  });
  // touch: a tap shows the full "in" state for one sweep, then exits like a hover leave
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    for (const h of hostsAt(e.target)) {
      touched.add(h); h.setAttribute("data-touch-effect", "true"); step(h);
      clearTimeout(h._warpTouch);
      h._warpTouch = setTimeout(() => { touched.delete(h); h.removeAttribute("data-touch-effect"); step(h); }, duration(h) + 80);
    }
  });
  const onFocus = (e) => { const hs = hostsAt(e.target); requestAnimationFrame(() => hs.forEach(step)); };
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);
  document.addEventListener("transitionend", (e) => {
    if (!/^(clip-path|transform)$/.test(e.propertyName)) return;
    const h = e.target.closest?.(HOST);
    if (h && h.dataset.phase === "out" && travel(h) === e.target) { clearTimeout(timers.get(h)); idle(h); }
  });
  // popovers open and close without an attribute change
  document.addEventListener("toggle", (e) => sync(e.target), true);

  // held states and new hosts: whatever the page changes, the phase follows
  const ATTRS = ["data-sweep", "data-pin", "data-hold", "aria-expanded", "aria-pressed", "data-state", "data-open"];
  new MutationObserver((records) => {
    const todo = new Set();
    for (const r of records) {
      if (r.type === "childList") { for (const n of r.addedNodes) if (n.nodeType === 1) init(n); continue; }
      const t = r.target;
      if (r.attributeName === "data-sweep" && t.hasAttribute("data-sweep")) { init(t); continue; }
      hostsAt(t).forEach((h) => todo.add(h));
      if (r.attributeName === "data-open" && t.matches('[data-scope="field"]')) t.querySelectorAll(':scope > [data-part="control"]').forEach((h) => todo.add(h));
    }
    todo.forEach(step);
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });

  // floatingLabel()'s label anatomy (01-foundations §2, "Label anatomy"), one implementation for every page:
  //   <label data-part="label" for="…"><span data-part="label-text">Email address</span>
  //     <span data-part="label-chars" aria-hidden="true"><span data-char data-c="E"></span>…</span></label>
  // The visually hidden label-text (no text-transform, no tracking) is the accessible name, innerText, copy and
  // find; the letters are generated content (warp.css), so the per-character tint travels without ever spelling
  // the name out or reading it in caps. Idempotent; an older split (letters as text) is re-split from its text.
  // Returns the letter spans, for the page's per-character delays.
  const ESC = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
  const esc = (c) => c.replace(/[&"<>]/g, (m) => ESC[m]);
  function label(el) {
    if (!el) return [];
    if (!el.querySelector(':scope > [data-part="label-chars"]')) {
      const named = el.querySelector(':scope > [data-part="label-text"]');
      const text = (named ? named.textContent : el.textContent).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      el.innerHTML = `<span data-part="label-text">${esc(text)}</span><span data-part="label-chars" aria-hidden="true">${[...text].map((c) => `<span data-char data-c="${esc(c)}"></span>`).join("")}</span>`;
    }
    return el.querySelectorAll('[data-part="label-chars"] > [data-char]');
  }

  window.warpSweep = { init, sync, pin, confirm, duration, label };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init());
  else init();
})();
