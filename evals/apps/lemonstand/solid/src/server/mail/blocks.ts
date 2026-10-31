
/**
 * Tiny block model for email bodies (same idea as technomancyIT's blocks.ts,
 * in Lemonstand colors). Every string is escaped; rendering is a pure function
 * so plain-text and HTML come from the same blocks.
 */
export type Block =
  | { kind: "eyebrow"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "detail"; label: string; value: string }
  | { kind: "quote"; text: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "note"; text: string };

const C = {
  bg: "#fbf7ec",
  panel: "#fffdf7",
  ink: "#1b1f33",
  muted: "#5d6070",
  line: "#e9e2cf",
  lemon: "#ffd23f",
  navy: "#1f2b5c",
} as const;
const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const HEAD = "Georgia, Cambria, 'Times New Roman', serif";

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const nl = (v: string) => esc(v).replace(/\n/g, "<br>");

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "eyebrow":
      return `<p style="margin:0 0 8px;font:700 11px/1.4 ${BODY};letter-spacing:.14em;text-transform:uppercase;color:${C.navy}">${esc(b.text)}</p>`;
    case "heading":
      return `<h1 style="margin:0 0 14px;font:600 26px/1.2 ${HEAD};color:${C.ink}">${esc(b.text)}</h1>`;
    case "paragraph":
      return `<p style="margin:0 0 14px;font:400 15px/1.6 ${BODY};color:${C.ink}">${nl(b.text)}</p>`;
    case "detail":
      return `<p style="margin:0 0 6px;font:400 14px/1.5 ${BODY};color:${C.ink}"><span style="color:${C.muted}">${esc(b.label)}:</span> <strong>${esc(b.value)}</strong></p>`;
    case "quote":
      return `<div style="margin:12px 0 16px;padding:14px 16px;border-left:4px solid ${C.lemon};background:${C.bg};font:400 15px/1.6 ${BODY};color:${C.ink}">${nl(b.text)}</div>`;
    case "button":
      return `<p style="margin:18px 0"><a href="${esc(b.url)}" style="display:inline-block;padding:12px 20px;border:2px solid ${C.ink};border-radius:12px;background:${C.lemon};color:${C.ink};font:700 15px ${BODY};text-decoration:none">${esc(b.label)}</a></p>`;
    case "note":
      return `<p style="margin:16px 0 0;font:400 12px/1.5 ${BODY};color:${C.muted}">${nl(b.text)}</p>`;
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case "eyebrow":
      return b.text.toUpperCase();
    case "heading":
      return `${b.text}\n${"=".repeat(Math.min(b.text.length, 60))}`;
    case "detail":
      return `${b.label}: ${b.value}`;
    case "quote":
      return b.text.split("\n").map((l) => `> ${l}`).join("\n");
    case "button":
      return `${b.label}: ${b.url}`;
    default:
      return b.text;
  }
}

export function render(blocks: Block[], preheader = ""): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:${C.bg}">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="height:14px;background:repeating-linear-gradient(90deg,${C.lemon} 0 28px,${C.panel} 28px 56px);border-radius:14px 14px 0 0;border:2px solid ${C.ink};border-bottom:0"></td></tr>
<tr><td style="background:${C.panel};border:2px solid ${C.ink};border-radius:0 0 14px 14px;padding:28px">
<p style="margin:0 0 20px;font:600 20px ${HEAD};color:${C.ink}">lemonstand<span style="color:#2f9e44">.ai</span></p>
${blocks.map(blockHtml).join("\n")}
</td></tr></table></td></tr></table></body></html>`;
  return { html, text: blocks.map(blockText).join("\n\n") };
}
