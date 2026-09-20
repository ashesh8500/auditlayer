import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
const safeTags = new Set(['section', 'h2', 'h3', 'h4', 'p', 'div', 'span', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'br', 'hr', 'a']);

/** Mirror the worker's strict section subset; do not repair unsafe identities. */
export function editableReportSections(html: string): string[] {
  const headings: string[] = [];
  let invalid = false;
  const document = parse(html, { sourceCodeLocationInfo: true, onParseError(error) {
    if (error.code !== 'missing-doctype') invalid = true;
  } });
  function safe(node: Node, root: Node, inParagraph = false): boolean {
    if ('value' in node) return true;
    if (!('tagName' in node) || !safeTags.has(node.tagName)) return false;
    if (inParagraph && !['strong', 'em', 'b', 'i', 'a', 'span', 'br'].includes(node.tagName)) return false;
    if (node !== root && node.tagName === 'section') return false;
    // HTML's tree builder inserts this inert container for explicit table rows.
    // Never extend the exception to authored/unclosed containers or cells.
    const implicitTableBody = node.tagName === 'tbody' && !node.sourceCodeLocation
      && node.attrs.length === 0 && node.parentNode
      && 'tagName' in node.parentNode && node.parentNode.tagName === 'table'
      && node.childNodes.some(child => 'tagName' in child && child.tagName === 'tr')
      && node.childNodes.every(child => 'value' in child ? !child.value.trim() : 'tagName' in child && child.tagName === 'tr');
    if (!['br', 'hr'].includes(node.tagName) && !node.sourceCodeLocation?.endTag && !implicitTableBody) return false;
    if (!node.attrs.every(({ name, value }) => {
      if (name === 'class') return /^[A-Za-z0-9 _-]{1,200}$/.test(value);
      if (name === 'style') return /^width:\d{1,3}%$/.test(value);
      if (name === 'href' && node.tagName === 'a') return /^https?:\/\//i.test(value);
      return ['colspan', 'rowspan'].includes(name) && ['th', 'td'].includes(node.tagName)
        && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 20;
    })) return false;
    return node.childNodes.every(child => safe(child, root, inParagraph || node.tagName === 'p'));
  }
  function text(node: Node): string {
    return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(text).join('') : '';
  }
  function countH2(node: Node): number {
    return ('tagName' in node && node.tagName === 'h2' ? 1 : 0)
      + ('childNodes' in node ? node.childNodes.reduce((n, child) => n + countH2(child), 0) : 0);
  }
  function headingInline(node: Node): boolean {
    if ('value' in node) return true;
    return 'tagName' in node && ['span', 'strong', 'em', 'b', 'i'].includes(node.tagName)
      && node.childNodes.every(headingInline);
  }
  function visit(node: Node) {
    if ('tagName' in node && node.tagName === 'section') {
      const first = node.childNodes.find(n => !('value' in n && !n.value.trim()));
      if (!safe(node, node) || countH2(node) !== 1 || !first || !('tagName' in first) || first.tagName !== 'h2' || !first.childNodes.every(headingInline)) {
        invalid = true;
        return;
      }
      const heading = text(first).trim();
      if (!heading || [...heading].length > 160) invalid = true;
      else headings.push(heading);
      return;
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(document);
  return invalid ? [] : headings.filter(h => headings.filter(other => other === h).length === 1);
}

export const BLOCKED_REFINEMENT_TERMS = [
  "system prompt", "developer message", "token budget", "backend", "config",
  "api key", "execute", "shell", "pricing", "stripe", "all reports", "other users",
] as const;

export interface RefinementValidation {
  ok: boolean;
  error?: string;
  section?: string;
  instruction?: string;
}

export function validateRefinement(
  section: string,
  instruction: string,
  allowedSections: readonly string[] = [],
): RefinementValidation {
  const normalizedSection = section.trim();
  if (!allowedSections.includes(normalizedSection)) {
    return { ok: false, error: "Refinement section is not available in this report." };
  }
  const normalizedInstruction = instruction.trim();
  if (normalizedInstruction.length < 8 || normalizedInstruction.length > 4000) {
    return { ok: false, error: "Refinement instruction must be between 8 and 4,000 characters." };
  }
  if (BLOCKED_REFINEMENT_TERMS.some(term => normalizedInstruction.toLowerCase().includes(term))) {
    return { ok: false, error: "Refinement request is outside section-scoped report editing." };
  }
  return { ok: true, section: normalizedSection, instruction: normalizedInstruction };
}
