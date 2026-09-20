"""Explicit local paid qualification; never updates catalog, flags or customer SQL.

python -m auditlayer_worker.qualify_research --help
Default is a no-network admission check. --live is a separately authorized spend.
"""
import argparse
from dataclasses import asdict, replace
import json
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from .commercial import pinned_settings, terminal_payload
from .config import WorkerSettings
from .core import AuditRecord
from .openrouter import safe_receipts
from .pipeline import GenerationPipeline, PrintEventSink
from .research import research_messages
from .worker import build_generator


def _durable_json(path, value):
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, allow_nan=False, default=str)
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    if json.loads(path.read_text()) != json.loads(json.dumps(value, default=str)):
        raise RuntimeError('qualification receipt readback failed')


def qualify(settings, candidate, output, *, execute=False):
    """Run the production pipeline with an exclusive local, read-backed ledger.

    This supplies live runtime/evidence evidence only, not SQL/launch approval.
    The separate full-chain SQL tracer proves quote/admission/settlement semantics.
    """
    output = Path(output).resolve()
    pin = candidate['pin']
    research_messages(candidate['handle'], candidate['platform'])
    app = SimpleNamespace(token_cap=settings.token_cap, cost_cap_usd=settings.cost_cap_usd,
                          hermes_model=settings.hermes_model, hermes_api_base=settings.hermes_api_base,
                          enabled_toolsets=())
    config = pinned_settings(settings, app, pin)
    if config.research_policy is None:
        raise ValueError('qualification requires explicit research policy')
    if not execute:
        return dict(status='dry_run', model=config.hermes_model,
                    token_cap=config.token_cap, upstream_ceiling_usd=config.cost_cap_usd,
                    research_policy=asdict(config.research_policy))
    if not os.environ.get('ALM_OPENROUTER_API_KEY'):
        raise RuntimeError('ALM_OPENROUTER_API_KEY is required')
    # mkdir is the replay fence, even after kill/persistence failure. Never reuse.
    output.mkdir(parents=True, exist_ok=False)
    _durable_json(output/'candidate.json', candidate)
    config = replace(config, supabase_url=None, supabase_service_role_key=None,
                     output_dir=output, alm_accounts_root=str(output/'accounts'))
    audit = AuditRecord(id=str(uuid4()), handle=candidate['handle'], platform=candidate['platform'],
                        goal=candidate.get('goal', 'growth'), report_type='standard',
                        plan='enterprise', force_refresh=True, context='')
    generator = build_generator(config, app)
    sequence = 0
    def record(calls):
        nonlocal sequence
        sequence += 1
        _durable_json(output/f'receipt-{sequence:03d}.json', safe_receipts(calls))
    summary = GenerationPipeline(config, generator).run(
        audit, PrintEventSink(), persist_report=False, run_kind='benchmark',
        token_cap=config.token_cap, cost_cap_usd=config.cost_cap_usd,
        local_inference_recorder=record)
    calls = generator.client._inference_receipts
    preview = terminal_payload(audit.id, config.worker_id, pin, summary, calls)
    qualified = (summary.status == 'ready' and summary.evidence_items > 0
                 and any(c.get('stage') == 'research' and c.get('status') == 'completed' for c in calls)
                 and all(c.get('cost_source') == 'provider_actual' for c in calls))
    result = dict(status='candidate_pass' if qualified else 'candidate_blocked',
                  launch_qualified=False, summary=asdict(summary),
                  receipts=safe_receipts(calls), settlement_preview=preview)
    _durable_json(output/'result.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True, help='Operator-reviewed candidate JSON; never written to SQL')
    parser.add_argument('--output', type=Path, required=True, help='New exclusive run directory (never reuse after failure)')
    parser.add_argument('--token-cap', type=int, required=True)
    parser.add_argument('--cost-cap-usd', type=float, required=True)
    parser.add_argument('--live', action='store_true', help='Authorize this one paid attempt; no retries')
    args = parser.parse_args()
    settings = replace(WorkerSettings.from_env(), token_cap=args.token_cap, cost_cap_usd=args.cost_cap_usd)
    result = qualify(settings, json.loads(args.candidate.read_text()), args.output, execute=args.live)
    print(json.dumps(result, indent=2, default=str))
    return 0 if result['status'] in ('dry_run', 'candidate_pass') else 1


if __name__ == '__main__':
    raise SystemExit(main())
