import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ExperienceBanner } from "./experience-banner";
import {
  ExperienceEmpty,
  ExperienceLoading,
  ExperienceError,
  ExperienceDelayed,
} from "./experience-state";
import { PageHeader } from "./page-header";

// Static server render is enough to prove the primitives' structure, tone
// mapping, roles, focus semantics, and minimum target sizing without a DOM.
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("ExperienceBanner", () => {
  it("renders neutral tone by default with status role", () => {
    const html = render(<ExperienceBanner>Body text</ExperienceBanner>);
    expect(html).toContain('data-slot="experience-banner"');
    expect(html).toContain('role="status"');
    expect(html).toContain("bg-card");
    expect(html).toContain("Body text");
  });

  it.each([
    ["info", "var(--blue-muted)", "var(--blue)"],
    ["success", "var(--green-muted)", "var(--green)"],
    ["warning", "var(--amber-muted)", "var(--amber)"],
    ["danger", "var(--red-muted)", "var(--red)"],
  ] as const)("maps tone %s to semantic tokens", (tone, bgToken, textToken) => {
    const html = render(<ExperienceBanner tone={tone} title="Title" />);
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(bgToken);
    expect(html).toContain(textToken);
    // No hardcoded hex may leak from the primitive.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("uses role=alert for destructive notices", () => {
    const html = render(<ExperienceBanner tone="danger" role="alert" />);
    expect(html).toContain('role="alert"');
  });

  it("renders an action slot", () => {
    const html = render(
      <ExperienceBanner action={<button type="button" className="min-h-11">Retry</button>}>
        Body
      </ExperienceBanner>,
    );
    expect(html).toContain("Retry");
  });
});

describe("ExperienceState primitives", () => {
  it("ExperienceEmpty renders title, description, and action", () => {
    const html = render(
      <ExperienceEmpty
        title="No subjects yet"
        description="Start a new audit to create one."
        action={<button type="button" className="min-h-11">Start</button>}
      />,
    );
    expect(html).toContain('data-slot="experience-empty"');
    expect(html).toContain("No subjects yet");
    expect(html).toContain("Start a new audit to create one.");
    expect(html).toContain("border-dashed");
  });

  it("ExperienceLoading renders a status region with skeleton rows", () => {
    const html = render(<ExperienceLoading label="Loading reports" rows={3} />);
    expect(html).toContain('data-slot="experience-loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading reports");
    expect(html).toContain("alm-skeleton");
    expect((html.match(/alm-skeleton/g) ?? []).length).toBe(3);
  });

  it("ExperienceError renders an alert with danger tokens", () => {
    const html = render(<ExperienceError>Generation failed</ExperienceError>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("var(--red-muted)");
    expect(html).toContain("Something went wrong");
  });

  it("ExperienceDelayed renders a warning surface", () => {
    const html = render(<ExperienceDelayed>Still running</ExperienceDelayed>);
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("var(--amber-muted)");
    expect(html).toContain("Taking longer than expected");
  });
});

describe("PageHeader", () => {
  it("renders kicker, h1, description, and actions", () => {
    const html = render(
      <PageHeader
        kicker="Intelligence"
        title="Subjects"
        description="Each subject owns channels and a Living Brief."
        actions={<button type="button" className="min-h-11">New audit</button>}
      />,
    );
    expect(html).toContain('data-slot="page-header"');
    expect(html).toContain("alm-kicker");
    expect(html).toContain("<h1");
    expect(html).toContain("Subjects");
    expect(html).toContain("Living Brief");
    expect(html).toContain("New audit");
  });
});

describe("Focus and target sizing", () => {
  it("banner action slot keeps a 44px-capable button", () => {
    const html = render(
      <ExperienceBanner action={<button type="button" className="inline-flex min-h-11 items-center px-4">Go</button>}>
        Body
      </ExperienceBanner>,
    );
    expect(html).toContain("min-h-11");
  });

  it("empty action slot keeps a 44px-capable button", () => {
    const html = render(
      <ExperienceEmpty
        title="Empty"
        action={<button type="button" className="inline-flex min-h-11 items-center px-4">Go</button>}
      />,
    );
    expect(html).toContain("min-h-11");
  });

  it("primitive surfaces never emit hardcoded hex colors", () => {
    const html = render(
      <div>
        <ExperienceBanner tone="danger">D</ExperienceBanner>
        <ExperienceEmpty title="E" />
        <ExperienceError>F</ExperienceError>
        <ExperienceDelayed>G</ExperienceDelayed>
      </div>,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
