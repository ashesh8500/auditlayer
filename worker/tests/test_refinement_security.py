from types import SimpleNamespace
import pytest
from auditlayer_worker.core import AuditRecord
from auditlayer_worker.generation import HermesReportGenerator


def test_inference_boundary_rejects_tools_before_agent_construction():
    from auditlayer_worker.hermes_inprocess import InProcessHermesClient
    client = object.__new__(InProcessHermesClient)
    client.settings = SimpleNamespace(hermes_provider='deepseek')
    with pytest.raises(ValueError, match='tool-free'):
        client.chat([], 'deepseek-v4-flash', toolsets=('web',))


def test_refinement_never_forwards_configured_tools():
    calls = []
    def chat(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(content='<section><h2>Key Gaps</h2><p>Safe edit</p></section>', model='deepseek-v4-flash', usage=SimpleNamespace(tokens_in=4, tokens_out=3))
    gen = HermesReportGenerator(SimpleNamespace(chat=chat), 'deepseek-v4-flash', ('web', 'browser'), 4000, .2)
    audit = AuditRecord.from_row({'id':'a','handle':'demo','report_type':'pulse'})
    gen.refine(audit, '<section><h2>Key Gaps</h2><p>Old</p></section>', 'Key Gaps', 'Clarify this section', lambda *a: None)
    assert calls[0]['toolsets'] == ()


def test_invalid_paid_response_retains_usage():
    from auditlayer_worker.generation import GenerationStageError
    response = SimpleNamespace(content='<script>bad</script>', model='deepseek-v4-flash', usage=SimpleNamespace(tokens_in=42, tokens_out=7))
    gen = HermesReportGenerator(SimpleNamespace(chat=lambda **kw: response), 'deepseek-v4-flash', (), 4000, .2)
    audit = AuditRecord.from_row({'id':'a','handle':'demo','report_type':'pulse'})
    with pytest.raises(GenerationStageError) as error:
        gen.refine(audit, '<section><h2>Key Gaps</h2></section>', 'Key Gaps', 'Clarify this section', lambda *a: None)
    assert (error.value.tokens_in, error.value.tokens_out) == (42, 7)


def test_encoded_heading_and_literal_backslashes_are_preserved():
    from auditlayer_worker.refinement_sections import replace_refinement_section
    old = '<section><h2>Risks &amp; Gaps</h2><p>Old</p></section>'
    new = '<section><h2>Risks &amp; Gaps</h2><p>Use \\1 literally</p></section>'
    assert replace_refinement_section(old, 'Risks & Gaps', new) == new
    with pytest.raises(ValueError, match='section'):
        replace_refinement_section(old + old, 'Risks & Gaps', new)


def test_missing_section_rejected_before_paid_call():
    calls = []
    gen = HermesReportGenerator(SimpleNamespace(chat=lambda **kw: calls.append(kw)), 'deepseek-v4-flash', (), 4000, .2)
    audit = AuditRecord.from_row({'id':'a','handle':'demo','report_type':'pulse'})
    with pytest.raises(ValueError, match='section'):
        gen.refine(audit, '<section><h2>Key Gaps</h2></section>', 'Executive Summary', 'Clarify this section', lambda *a: None)
    assert calls == []
