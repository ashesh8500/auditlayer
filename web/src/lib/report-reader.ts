/** Navigation is derived from actual artifact headings, never template names or prose classifiers. */
export type ReaderChapter = { id: string; label: string; stable: boolean };
export function indexReport(root: ParentNode): ReaderChapter[] {
  const used = new Set(Array.from(root.querySelectorAll('[id]'), el => el.id));
  return Array.from(root.querySelectorAll<HTMLElement>('h2')).map((heading, index) => {
    const section = heading.closest('section');
    const target = section || heading;
    const stable = Boolean(target.id);
    if (!target.id) {
      let id = `reader-section-${index + 1}`;
      while (used.has(id)) id += '-local';
      target.id = id;
      used.add(id);
    }
    target.tabIndex = -1;
    return { id: target.id, label: heading.textContent?.trim() || `Section ${index + 1}`, stable };
  }).filter((chapter, i, rows) => rows.findIndex(row => row.id === chapter.id) === i);
}
export function readerHashTarget(hash: string): string | null {
  try { return hash.startsWith('#report:') ? decodeURIComponent(hash.slice(8)) : null; }
  catch { return null; }
}
export function parseReaderVersion(value: string | null): number | null | 'invalid' {
  if (value === null) return null;
  if (!/^[1-9][0-9]*$/.test(value)) return 'invalid';
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 'invalid';
}
