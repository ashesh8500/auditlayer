"""Explicit workspace port; canonical contracts, no ambient configuration."""
from copy import deepcopy
from dataclasses import dataclass
import json
from uuid import UUID, uuid5, NAMESPACE_URL
from .workspace_contracts import validate
from .model_execution.execution import Executor, request_expectations


@dataclass(frozen=True)
class WorkspaceRunResult:
    """No legacy float-cost projection: unknown provider spend remains null."""
    audit_id: str
    status: str
    receipt: dict
    report_path: str | None = None


class SQLAdmission:
    def __init__(self, gateway, payload):
        self.gateway, self.payload = gateway, deepcopy(payload)

    def consume(self, attempt_id, expected):
        if attempt_id != self.payload['attempt_id'] or expected != self.payload['expected']:
            raise ValueError('execution request changed')
        self.gateway.workspace_rpc('workspace_execution_admit', self.payload)
        # A transport error here is ambiguous. Never retry this permission RPC.
        return self.gateway.workspace_rpc('workspace_execution_dispatch', {
            'reservation_id': self.payload['reservation_id'],
            'worker_id': self.payload['worker_id'], 'attempt_id': attempt_id,
            'expected': expected})


class WorkspaceExecution:
    """Trusted composition only, never construct from arbitrary request kwargs.

    Qualification must come from deployment-controlled evaluation/configuration.
    Evidence acquisition is a separately admitted job; this port performs one
    tool-free analysis call and never reads profiles, environment or credentials.
    """
    def __init__(self, *, intent, request, reservation_id, intelligence_run_id,
                 worker_id, boundary, qualification_id, bundle_version, lease_seconds=300):
        if not isinstance(qualification_id, str) or not qualification_id.strip():
            raise ValueError('model unavailable: trusted qualification required')
        if not isinstance(bundle_version, str) or not bundle_version.strip():
            raise ValueError('bundle pin required')
        self.bundle_version = bundle_version
        self.intent = validate_intent(intent)
        self.request = deepcopy(request)
        self.boundary = boundary
        self.reservation_id = str(UUID(reservation_id))
        self.run_id = str(UUID(intelligence_run_id))
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        expected = request_expectations(self.request)
        q = self.intent['quote']
        if (request.intent_id != self.intent['id'] or request.owner_id != q['refs']['owner_id']
                or request.subject_id != q['refs']['subject_id']
                or q['input_fingerprint'] != 'sha256:' + expected['request_fingerprint']
                or q['model'] != {k: expected[k] for k in ('provider','model','model_version','data_route')}
                or q['rate_card_version'] != expected['rate_card_version']
                or q['upstream_max']['microusd'] != expected['upstream_max_microusd']
                or q['customer_max']['microusd'] != expected['customer_max_microusd']):
            raise ValueError('canonical quote/request mismatch')

    def run(self, audit, sink, *, gateway):
        if audit != self.request.audit or audit.user_id != self.request.owner_id:
            raise ValueError('audit request mismatch')
        payload = dict(intent=self.intent, reservation_id=self.reservation_id,
            audit_id=audit.id, intelligence_run_id=self.run_id,
            attempt_id=self.request.attempt_id, worker_id=self.worker_id,
            lease_seconds=self.lease_seconds, expected=request_expectations(self.request))
        result = Executor(self.boundary, SQLAdmission(gateway, payload)).execute(self.request)
        receipt = self.pending_receipt(result)
        if result.analysis is not None:
            return self.finalize_analysis(audit, sink, gateway, result, receipt)
        gateway.workspace_rpc('workspace_execution_finish', dict(
            reservation_id=self.reservation_id, receipt=receipt, artifact_version_id=None))
        return WorkspaceRunResult(audit.id, 'pending_reconciliation', receipt)

    def pending_receipt(self, result):
        q = self.intent['quote']
        unknown = result.usage.state == 'unknown'
        # SDK token counters are NOT provider actual cost. Never turn tariff or
        # conservative rated cost into a measured upstream liability.
        receipt = dict(id=str(uuid5(NAMESPACE_URL, 'alm-receipt:' + self.request.attempt_id)),
            run_intent_id=self.intent['id'], reservation_id=self.reservation_id,
            refs=q['refs'], model=q['model'], rate_card_version=q['rate_card_version'],
            measurement='unknown' if unknown else 'estimated', status='pending_reconciliation',
            input_tokens=None if unknown else result.usage.input_tokens,
            output_tokens=None if unknown else result.usage.output_tokens,
            cache_read_tokens=None if unknown else result.usage.cached_input_tokens,
            cache_write_tokens=None, tool_calls=None if unknown else 0,
            customer_charge={'currency':'USD','microusd':0},
            successful_path_upstream_cost=None, absorbed_retry_upstream_cost=None,
            total_upstream_cost=None, settled_at=None)
        return deepcopy(validate('UsageReceipt', receipt))

    def finalize_analysis(self, audit, sink, gateway, result, receipt):
        """Render and publish through the existing immutable report finalizer.

        The full deterministic report template still requires the separately
        admitted evidence job; until then a successful analysis is linked as a
        quoted, pending-reconciliation artifact and never silently billed or
        discarded.
        """
        from .core import assemble_structured_report_html
        html = assemble_structured_report_html(audit, json.dumps(result.analysis, sort_keys=True))
        report_path = gateway.upload_workspace_report(audit.id, self.request.attempt_id, html)
        version = gateway.workspace_rpc('workspace_execution_publish', dict(
            reservation_id=self.reservation_id, receipt=receipt, report_path=report_path,
            delivery_status='needs_review', prompt_version=self.intent['quote']['refs']['policy_version'],
            agent_bundle_version=self.bundle_version))
        sink.emit('pending_reconciliation', 'Quoted analysis published; provider cost is unresolved.')
        return WorkspaceRunResult(audit.id, 'pending_reconciliation', receipt, report_path=str(version))


def validate_intent(intent):
    return deepcopy(validate('RunIntent', intent))
