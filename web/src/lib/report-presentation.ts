import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function text(node: Node): string {
  return "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : "";
}

/** Read-time presentation only. Stored artifacts are never rewritten. This is
 * not a sanitizer: generation validation and existing serving boundaries remain
 * authoritative. Source offsets preserve all untouched evidence/content bytes. */
export function presentReportHtml(html: string, origin = "https://auditlayermedia.com"): string {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const edits: { start: number; end: number; value: string }[] = [];
  function visit(node: Node) {
    if ("tagName" in node) {
      const el = node as Element;
      const loc = el.sourceCodeLocation;
      const href = el.attrs.find(a => a.name === "href");
      if (el.tagName === "a" && href && loc?.attrs?.href) {
        try {
          const url = new URL(href.value, origin);
          if ([new URL(origin).origin, "https://auditlayermedia.com", "https://www.auditlayermedia.com"].includes(url.origin) && url.pathname === "/pricing") {
            const selected = url.searchParams.get("plan");
            const plan = selected === "starter" || selected === "pro" ? selected : /extended|\bpro\b/i.test(text(el)) ? "pro" : /standard|starter/i.test(text(el)) ? "starter" : null;
            const destination = new URL(`/pricing${plan ? `?plan=${plan}` : ""}`, origin).href;
            const attr = loc.attrs.href;
            edits.push({ start: attr.startOffset, end: attr.endOffset, value: `href="${destination}"` });
          }
        } catch { /* Non-URL links are left untouched. */ }
      }
      if (loc && el.tagName === "table" && !("attrs" in (el.parentNode ?? {}) && (el.parentNode as Element).attrs.some(a => a.name === "class" && a.value.split(/\s+/).includes("alm-table-scroll")))) {
        edits.push({ start: loc.startOffset, end: loc.startOffset, value: '<div class="alm-table-scroll" role="region" tabindex="0" aria-label="Scrollable report table">' });
        edits.push({ start: loc.endOffset, end: loc.endOffset, value: '</div>' });
      }
      if (loc && el.tagName === "p" && /^Prompt v[\w.-]+\s*·\s*[^·]+\s*·\s*~?\$[\d.]+\s*·\s*[\d,]+\s*\+\s*[\d,]+ tokens\s*$/i.test(text(el).trim())) {
        edits.push({ start: loc.startOffset, end: loc.endOffset, value: "" });
        return;
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(doc);
  // Apply original-coordinate edits right-to-left. At a shared boundary,
  // consume a replacement before inserting, and apply insertions in reverse
  // discovery order so a table's close precedes its next sibling's open.
  for (const edit of edits.map((edit, index) => ({ ...edit, index })).sort(
    (a, b) => b.start - a.start || b.end - a.end || b.index - a.index,
  )) {
    html = html.slice(0, edit.start) + edit.value + html.slice(edit.end);
  }
  if (!html.includes('data-alm-presentation')) {
    const style = `<style data-alm-presentation>${REPORT_PRESENTATION_CSS}</style>`;
    html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${style}</head>`) : style + html;
  }
  return html;
}

const REPORT_PRESENTATION_CSS = `
html, body { min-width: 0; max-width: 100%; }
.container, main, section, .sw-grid > *, .metric-grid > *, .creative-grid > *, .pricing-grid > * { min-width: 0; }
.container { width: 100%; box-sizing: border-box; }
p, h1, h2, h3, h4, li, a, .subtitle, .meta { overflow-wrap: anywhere; }
img, svg { max-width: 100%; }
.alm-table-scroll { max-width: 100%; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; margin-bottom: 24px; }
.alm-table-scroll:focus-visible { outline: 2px solid var(--accent, #0d9488); outline-offset: 2px; }
.alm-table-scroll > table { margin-bottom: 0; }
@media (max-width: 600px) {
  .container { padding: 32px 20px 64px; }
  .sw-grid, .creative-grid, .pricing-grid { grid-template-columns: minmax(0, 1fr); }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-card { padding: 16px 10px; }
  .metric-card .value { overflow-wrap: anywhere; }
  .sd-label, .sd-name { width: 38%; min-width: 0; overflow-wrap: anywhere; }
  .sd-track { min-width: 0; }
  .sd-header { flex-wrap: wrap; gap: 8px; }
  .upgrade-box { padding: 24px 16px; }
  .cta-btn, .cta-button { max-width: 100%; box-sizing: border-box; white-space: normal; }
  .calendar-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); overflow-wrap: anywhere; }
  .calendar-grid .ch, .calendar-grid .cr { padding: 8px 4px; min-width: 0; }
}
@media print { .alm-table-scroll { overflow: visible; } }
`;

