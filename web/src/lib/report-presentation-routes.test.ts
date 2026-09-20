import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: vi.fn(), share: vi.fn(), download: vi.fn(), admin: vi.fn(), view: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/audit-access', () => ({ getAuditForViewer: mocks.access }));
vi.mock('@/lib/share-access', () => ({ getAuditForShare: mocks.share, incrementShareView: mocks.view }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/env', () => ({ isSupabaseAdminConfigured: () => true }));
import { GET as report } from '@/app/api/audits/[id]/report/route';
import { GET as read } from '@/app/api/audits/[id]/read/route';
import { GET as share } from '@/app/api/share/[token]/report/route';

beforeEach(() => {
  vi.clearAllMocks();
  const audit = { id: 'audit', user_id: 'owner', status: 'ready', report_path: 'private/report.html', handle: 'fixture' };
  mocks.access.mockResolvedValue({ audit, viewer: { id: 'owner' }, error: null });
  mocks.share.mockResolvedValue({ ok: true, audit, link: { mode: 'public' } });
  mocks.admin.mockReturnValue({ storage: { from: () => ({ download: mocks.download }) } });
  mocks.download.mockResolvedValue({ data: new Blob(['<html><head></head><body><p>As of September 18 · public source</p><p>Prompt v1.8 · today · ~$0.12 · 2681+8450 tokens</p><table><tr><td>Evidence</td></tr></table></body></html>']), error: null });
});
for (const name of ['report', 'download', 'read', 'share']) {
  it(`projects legacy presentation on the authorized ${name} path`, async () => {
    const request = new Request(`http://local.test/api/report${name === 'download' ? '?download=1' : ''}`);
    const response = name === 'share' ? await share(request, { params: Promise.resolve({ token: 'token' }) }) : await (name === 'read' ? read : report)(request, { params: Promise.resolve({ id: 'audit' }) });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain('Prompt v1.8');
    expect(body).toContain('As of September 18 · public source');
    expect(body).toContain('alm-table-scroll');
    expect(response.headers.get('Cache-Control')).toBe(name === 'share' ? 'private, no-store' : 'private, no-cache');
    if (name === 'download') expect(response.headers.get('Content-Disposition')).toContain('attachment;');
  });
}
