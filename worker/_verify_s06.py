"""Verify S0.6 prompt version footer — all checks."""
from auditlayer_worker.core import PROMPT_VERSION, build_prompt_footer_line
footer = build_prompt_footer_line(tokens_in=18000, tokens_out=22000, cost_usd=1.23)
assert f'Prompt v{PROMPT_VERSION}' in footer
assert '18000+22000 tokens' in footer
print('1. core imports + footer builder OK')

from auditlayer_worker.pipeline import RunSummary, GenerationPipeline
print('2. pipeline imports OK')

from auditlayer_worker.generation import _mock_report_html
from auditlayer_worker.core import AuditRecord
r = AuditRecord(id='test', handle='test', platform='instagram', goal='growth')
html = _mock_report_html(r)
assert 'PROMPT_VERSION_LINE' in html
print('3. mock HTML has placeholder OK')

from pathlib import Path
tmpl = Path(__file__).parent / 'auditlayer_worker' / 'templates' / 'master-skeleton.html'
assert 'PROMPT_VERSION_LINE' in tmpl.read_text()
print('4. template has placeholder OK')

mig = Path(__file__).parent.parent / 'supabase' / 'migrations' / '0017_prompt_version.sql'
assert mig.exists()
print('5. migration exists OK')

print('\nALL 5 CHECKS PASSED')
