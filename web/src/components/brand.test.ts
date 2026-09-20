import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(tsx?|html)$/.test(file) && !file.includes(".test.") ? [file] : [];
  });
}

describe("approved ALM wordmark rollout", () => {
  it("uses accessible light and inverse outlined assets without old badge", () => {
    const component = read("web/src/components/brand.tsx");
    expect(component).toContain("alm-wordmark-inverse.svg");
    expect(component).toContain("alm-wordmark.svg");
    expect(component).toContain('aria-label="AuditLayerMedia"');
    expect(component).not.toContain("alm-mark.png");
    for (const variant of ["alm-wordmark.svg", "alm-wordmark-inverse.svg", "alm-icon.svg"]) {
      const asset = read(`web/public/brand/${variant}`);
      expect(asset).toContain("<path");
      expect(asset).not.toMatch(/<text|<image|@import|@font-face/);
      expect(asset).toContain(variant.includes("inverse") ? "#5ee0b5" : "#0f766e");
    }
  });
  it("brands metadata, authentication emails, and future report shells", () => {
    const metadata = read("web/src/app/layout.tsx");
    expect(metadata).toContain('/brand/alm-icon.svg');
    for (const file of ["supabase/templates/magic_link.html", "web/src/lib/auth/magic-link-email.ts"]) {
      const email = read(file);
      expect(email, file).toContain('aria-label="AuditLayerMedia"');
      expect(email, file).toContain('ALM<span style="color:#0f766e;">.</span>');
      expect(email, file).not.toMatch(/AuditLayer(?!Media)|>\s*AL\s*</);
    }
    const report = read("worker/auditlayer_worker/templates/master-skeleton.html");
    expect(report.match(/class="alm-wordmark"/g)).toHaveLength(2);
    expect(report).toContain('aria-label="AuditLayerMedia"');
    expect(report).not.toContain('background:linear-gradient(135deg,#0d9488,#0f766e)');
    expect(report).not.toMatch(/<script|<link|<text/);
  });
  it("keeps standalone public gates on the shared brand component", () => {
    for (const file of ["web/src/app/oauth/consent/page.tsx", "web/src/app/s/[token]/page.tsx", "web/src/app/s/[token]/share-report-view.tsx"]) {
      expect(read(file), file).toContain('<Brand');
    }
  });
  it("contains no stale active raster-logo references or AL badges", () => {
    const files = sources(path.join(root, "web/src"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/alm-mark\.png|alm-logo[^\s"']*|>\s*AL\s*<\/span>/);
    }
  });
});
