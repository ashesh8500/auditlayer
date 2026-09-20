"""Generate offline customer-surface QA artifacts; never call a model or database."""
from dataclasses import replace
from pathlib import Path
import runpy
import sys


def deny_network(event, args):
    if event in {"socket.connect", "socket.bind", "socket.getaddrinfo"}:
        raise RuntimeError(f"Network forbidden in report QA: {event}")


sys.addaudithook(deny_network)
from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.core import AuditRecord
from auditlayer_worker.generation import MockReportGenerator, _append_evidence_sources
from auditlayer_worker.pipeline import GenerationPipeline, PrintEventSink

output = Path(__file__).parent / "var" / "report-mobile-qa"
settings = replace(WorkerSettings.from_env(), generator="mock", output_dir=output,
                   alm_accounts_root=str(output / "accounts"))
audit = AuditRecord(id="mock-pipeline", handle="fictional_layout_fixture",
                    platform="instagram", goal="growth")
summary = GenerationPipeline(settings, MockReportGenerator()).run(audit, PrintEventSink(), gateway=None)
assert summary.status == "ready", summary
html = (output / "mock-pipeline.html").read_text()
assert "Prompt v" not in html and "tokens" not in html
assert summary.tokens_in > 0 and summary.cost_usd > 0
fixture = runpy.run_path(str(Path(__file__).parent / "tests" / "test_report_customer_surface.py"))
wide = _append_evidence_sources(fixture["wide_report"](),
    [("Offline citation fixture " + "x" * 120, "https://example.com/" + "x" * 200, "public_research")],
    connected_metrics=False)
(output / "wide-layout.html").write_text(wide)
print(f"Pipeline artifact: {output / 'mock-pipeline.html'}")
print(f"Stress fixture (not customer analysis): {output / 'wide-layout.html'}")
print(f"Internal accounting preserved: prompt={summary.prompt_version}, tokens={summary.tokens_in}+{summary.tokens_out}, cost={summary.cost_usd}")
