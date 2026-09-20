// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { indexReport, parseReaderVersion, readerHashTarget } from './report-reader';
describe('artifact navigation', () => {
  it('keeps real IDs and marks legacy links as version-local', () => {
    document.body.innerHTML = '<section id="real"><h2>Real title</h2></section><section><h2>Legacy title</h2></section><div id="reader-section-2"></div>';
    expect(indexReport(document)).toEqual([{id:'real',label:'Real title',stable:true},{id:'reader-section-2-local',label:'Legacy title',stable:false}]);
    expect(document.getElementById('real')?.tabIndex).toBe(-1);
  });
  it('never classifies prose as an action or a score', () => {
    document.body.innerHTML = '<p>Score 99. Post tomorrow.</p>';
    expect(indexReport(document)).toEqual([]);
  });
  it.each(['0','-1','1.0','1e2',' 2','02','9007199254740992'])('rejects malformed version %s', value => expect(parseReaderVersion(value)).toBe('invalid'));
  it('parses exact positive versions and safe fragment links', () => {
    expect(parseReaderVersion(null)).toBeNull(); expect(parseReaderVersion('2')).toBe(2);
    expect(readerHashTarget('#report:a%20b')).toBe('a b'); expect(readerHashTarget('#report:%')).toBeNull();
  });
});
