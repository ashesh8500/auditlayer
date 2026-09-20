import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/actions/refinements', () => ({requestRefinement:vi.fn()}));
vi.mock('@/lib/use-refinement-status', () => ({useRefinementStatus:(_a:string,rows:unknown[],version:number) => ({refinements:rows,reportVersion:version,error:''})}));
vi.mock('@/components/report-frame', () => ({ReportFrame:({src}: {src:string}) => <iframe src={src}/> }));
import { ReportViewer } from './report-viewer';
it('does not request invalid version zero for legacy reports', () => {
 const html=renderToStaticMarkup(<ReportViewer auditId="a" reportReady refinements={[]} editableSections={['Key Gaps']}/>);
 expect(html).not.toContain('version=0');
 expect(html).toContain('Key Gaps');
 expect(html).not.toContain('Executive Summary</option>');
});
it('disables refinement and download when file is missing', () => {
 const html=renderToStaticMarkup(<ReportViewer auditId="a" reportReady={false} refinements={[]} editableSections={['Key Gaps']}/>);
 expect(html).not.toContain('<iframe');
 expect(html).toMatch(/type="submit"[^>]*disabled/);
});
