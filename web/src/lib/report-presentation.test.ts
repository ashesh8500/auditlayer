import { describe, expect, it } from "vitest";
import { presentReportHtml } from "./report-presentation";

describe("immutable report presentation", () => {
  it("normalizes only known ALM pricing links, leaving evidence links intact", () => {
    const result = presentReportHtml('<html><body><a href="https://auditlayermedia.com/pricing">Upgrade to Extended — $50/month</a><a href="/pricing?plan=starter">Standard</a><a href="https://example.com/pricing">Source</a></body></html>', 'https://local.example');
    expect(result).toContain('href="https://local.example/pricing?plan=pro"');
    expect(result).toContain('href="https://local.example/pricing?plan=starter"');
    expect(result).toContain('href="https://example.com/pricing"');
  });
  it("wraps tables locally and adds responsive styles without altering their contents", () => {
    const table = '<table class="data-table"><tr><td>Evidence &amp; metrics</td></tr></table>';
    const result = presentReportHtml(`<html><head></head><body><section>${table}</section></body></html>`);
    expect(result).toContain(`aria-label="Scrollable report table">${table}</div>`);
    expect(result).toContain('data-alm-presentation');
    expect(presentReportHtml(result)).toBe(result);
  });
  it("keeps adjacent tables in distinct scroll regions using original source offsets", () => {
    const table = '<table><tr><td>Evidence</td></tr></table>';
    const open = '<div class="alm-table-scroll" role="region" tabindex="0" aria-label="Scrollable report table">';
    const result = presentReportHtml(`<html><body>${table}${table}</body></html>`);
    expect(result).toContain(`${open}${table}</div>${open}${table}</div>`);
    expect(presentReportHtml(result)).toBe(result);
  });
  it("preserves the table close when telemetry begins at the same offset", () => {
    const table = '<table><tr><td>Evidence</td></tr></table>';
    const result = presentReportHtml(`<html><body>${table}<p>Prompt v1.8 · today · ~$0.12 · 1+2 tokens</p><p>Sources preserved</p></body></html>`);
    expect(result).toContain(`${table}</div><p>Sources preserved</p>`);
    expect(result).not.toContain('tokens');
    expect(result).not.toContain('ns</p>');
    expect(presentReportHtml(result)).toBe(result);
  });
  it("removes only the legacy internal telemetry paragraph, preserving customer dates and evidence", () => {
    const html = '<html><body><footer><p>As of September 18, 2026 · Source: public profile</p><p style="font-size:0.65rem">Prompt v1.8 &middot; 2026-09-18 &middot; ~$0.12 &middot; 2681+8450 tokens</p><a href="https://example.com/source">Evidence</a></footer><p>Prompt videos work well. Budget $50. Token engagement is a risk.</p></body></html>';
    const result = presentReportHtml(html);
    expect(result).not.toContain('Prompt v1.8');
    expect(result).not.toContain('2681+8450');
    expect(result).toContain('As of September 18, 2026');
    expect(result).toContain('https://example.com/source');
    expect(result).toContain('Budget $50');
    expect(presentReportHtml(result)).toBe(result);
  });
});
