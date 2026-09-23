"""Offline regression for whitespace left by canonical slot-comment removal."""
import json

from test_product_strategy import public_case
from test_generation_runtime import _Client, _generator
from auditlayer_worker.openrouter import MODEL


def test_canonical_generated_strategy_has_no_trailing_whitespace():
    audit, evidence, form = public_case()
    generator = _generator(_Client([json.dumps(form)]))
    generator.model = MODEL
    result = generator.generate(audit, lambda *args: None, research_cache=json.dumps(evidence))
    assert all(line == line.rstrip() for line in result.html.splitlines())
