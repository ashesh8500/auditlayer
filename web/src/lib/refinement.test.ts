import { describe, it, expect } from "vitest";
import { editableReportSections, validateRefinement } from "./refinement";

describe("artifact-scoped refinements", () => {
  it("uses actual headings including Pulse and Blueprint, not a global list", () => {
    const sections = editableReportSections('<main><section><h2>Key Gaps</h2></section><section><h2>Three Immediate Moves</h2></section></main>');
    expect(sections).toEqual(['Key Gaps', 'Three Immediate Moves']);
    expect(validateRefinement('Executive Summary', 'Make it shorter', sections).ok).toBe(false);
    expect(validateRefinement('Key Gaps', 'Make it shorter', sections).ok).toBe(true);
  });
  it("keeps safe historical heading markup editable and rejects structural ambiguity", () => {
    for (const heading of ['<h2 class="section-title">Key Gaps</h2>', '<h2><span class="title">Key Gaps</span></h2>']) {
      expect(editableReportSections(`<section>${heading}<p>Evidence</p></section>`)).toEqual(['Key Gaps']);
    }
    for (const html of [
      '<section><h2><div>Key Gaps</div></h2></section>',
      '<section><h2>Key Gaps</h2><section><h2>Other</h2></section></section>',
      '<section><h2 onclick="bad()">Key Gaps</h2></section>',
      '<section><h2>Key Gaps</h2><h2>Key Gaps</h2></section>',
      '<section><h2 class="a" class="b">Key Gaps</h2></section>',
    ]) expect(editableReportSections(html)).toEqual([]);
  });
  it("keeps explicit rows editable when HTML parsing inserts an inert tbody", () => {
    const table = '<table><tr><td>Observed 123</td></tr></table>';
    expect(editableReportSections(`<section><h2>Key Gaps</h2>${table}</section>`)).toEqual(['Key Gaps']);
    for (const body of [
      '<table><tbody onclick="bad()"><tr><td>Observed 123</td></tr></tbody></table>',
      '<table><tbody><tr><td>Observed 123</td></tr></table>',
      '<table><tr><td>Observed 123</tr></table>',
      '<p><div>Observed 123</div></p>',
    ]) expect(editableReportSections(`<section><h2>Key Gaps</h2>${body}</section>`)).toEqual([]);
  });
  it("bounds heading Unicode code points consistently with the worker", () => {
    const heading = '😀'.repeat(100);
    expect(editableReportSections(`<section><h2>${heading}</h2></section>`)).toEqual([heading]);
    expect(editableReportSections(`<section><h2>${'😀'.repeat(161)}</h2></section>`)).toEqual([]);
  });
  it("does not expose duplicate, nested-markup, or non-section headings", () => {
    expect(editableReportSections('<h2>Outside</h2><section><h2><h2>Nested</h2></h2></section><section><h2>Same</h2></section><section><h2>Same</h2></section>')).toEqual([]);
    expect(validateRefinement('Key Gaps', 'x'.repeat(4001), ['Key Gaps']).ok).toBe(false);
  });
});
