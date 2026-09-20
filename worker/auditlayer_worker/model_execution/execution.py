"""Internal execution port. SQL admission/settlement remain external authorities.

Inject only a qualified product boundary; this module never resolves credentials.
Admission.consume MUST atomically validate a live SQL hold, authenticated owner,
quote/config/input pins and caps, and mark the attempt consumed across workers.
Its returned fields are checked here too, but this is not authorization in itself.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from threading import Lock
from typing import Mapping, Protocol

from ..core import AuditRecord, assemble_structured_report_html
from . import NormalizedUsage, normalize_usage
from .catalog import Model


@dataclass(frozen=True)
class Request:
    owner_id: str
    subject_id: str
    intent_id: str
    attempt_id: str
    model: Model
    audit: AuditRecord
    system: str
    user: str
    max_input: int
    max_output: int
    timeout_seconds: float
    tools: tuple[str, ...] = ()

    @property
    def messages(self) -> list[dict[str, str]]:
        return [{'role': 'system', 'content': self.system},
                {'role': 'user', 'content': self.user}]


class Admission(Protocol):
    def consume(self, attempt_id: str, expected: Mapping) -> Mapping: ...


class Boundary(Protocol):
    """count_input must include wire overhead using a qualified token upper bound."""
    def count_input(self, messages: list[dict[str, str]]) -> int: ...
    def complete(self, request: Request, model: Model) -> Mapping: ...


@dataclass(frozen=True)
class Result:
    attempt_id: str
    intent_id: str
    admission_receipt_id: str
    request_fingerprint: str
    analysis: dict | None
    usage: NormalizedUsage
    error: str | None
    disposition: str
    rated_upstream_microusd: int | None
    actual_upstream_microusd: int | None = None


def parse_analysis(content: str, audit: AuditRecord) -> dict:
    # Do not accept fenced JSON or provider-produced HTML. Reuse the existing
    # deterministic section/table/heading constraints and local escaping renderer.
    if not isinstance(content, str) or not content.strip().startswith('{'):
        raise ValueError('strict report JSON required')
    assemble_structured_report_html(audit, content)
    return json.loads(content)


def request_expectations(request: Request) -> dict:
    fingerprint = hashlib.sha256(json.dumps(asdict(request), sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    upstream = request.model.worst_case(request.max_input, request.max_output)
    return dict(owner_id=request.owner_id, subject_id=request.subject_id,
        intent_id=request.intent_id, request_fingerprint=fingerprint,
        provider=request.model.provider, model=request.model.model,
        model_version=request.model.model_version, data_route=request.model.data_route,
        rate_card_version=request.model.rate_version,
        upstream_max_microusd=upstream, customer_max_microusd=upstream * 3)


class Executor:
    def __init__(self, boundary: Boundary, admission: Admission):
        self.boundary = boundary
        self.admission = admission
        self._seen: set[str] = set()
        self._lock = Lock()

    def execute(self, request: Request) -> Result:
        from copy import deepcopy
        from math import isfinite
        from .catalog import resolve
        request = deepcopy(request)  # freeze mutable audit context before admission
        if resolve(request.model.provider, request.model.model, request.model.data_route) != request.model:
            raise ValueError('model/rate pin mismatch')
        if request.tools or any(not isinstance(v, str) or not v.strip() for v in (
                request.owner_id, request.subject_id, request.intent_id, request.attempt_id)):
            raise ValueError('invalid identity or tool policy')
        for n, ceiling in ((request.max_input, request.model.max_input),
                           (request.max_output, request.model.max_output)):
            if type(n) is not int or not 1 <= n <= ceiling:
                raise ValueError('invalid token limit')
        if (type(request.timeout_seconds) not in (int, float)
                or not isfinite(request.timeout_seconds) or not 0 < request.timeout_seconds <= 150):
            raise ValueError('invalid deadline')
        if any(not isinstance(s, str) or len(s.encode()) > 128000 for s in (request.system, request.user)):
            raise ValueError('invalid prompt')
        count = self.boundary.count_input(request.messages)
        if type(count) is not int or not 0 <= count <= request.max_input:
            raise ValueError('input token ceiling exceeded or unverified')
        expected = request_expectations(request)
        fingerprint = expected['request_fingerprint']
        with self._lock:
            if request.attempt_id in self._seen:
                raise ValueError('attempt already consumed; never replay')
            self._seen.add(request.attempt_id)
        receipt = self.admission.consume(request.attempt_id, expected)
        if not receipt.get('receipt_id') or any(receipt.get(k) != v for k, v in expected.items()):
            raise ValueError('admission receipt mismatch')
        import time
        from .containment import one_call
        packet = one_call(self.boundary, request, time.monotonic() + request.timeout_seconds)
        raw = packet.get('raw', {})
        error = packet.get('error')
        usage = normalize_usage(raw.get('usage')) if isinstance(raw, dict) else NormalizedUsage()
        payload = None
        if not error:
            try:
                if raw.get('model') != request.model.model:
                    error = 'model_drift'
                elif len(raw['choices']) != 1:
                    error = 'invalid_response'
                else:
                    choice = raw['choices'][0]
                    message = choice['message']
                    if message.get('refusal') or choice.get('finish_reason') == 'content_filter':
                        error = 'refusal'
                    elif message.get('tool_calls') or message.get('function_call'):
                        error = 'tool_call'
                    elif choice.get('finish_reason') != 'stop':
                        error = 'truncated'
                    else:
                        try:
                            payload = parse_analysis(message.get('content'), request.audit)
                        except (ValueError, TypeError):
                            error = 'invalid_analysis'
            except (KeyError, IndexError, TypeError, AttributeError):
                error = 'invalid_response'
        rated = None
        if usage.input_tokens is not None and usage.output_tokens is not None:
            rated = request.model.worst_case(usage.input_tokens, usage.output_tokens)
            if usage.input_tokens > request.max_input or usage.output_tokens > request.max_output:
                error = 'usage_limit'
        disposition = ('absorbed_failure' if error else
                       'pending_reconciliation' if usage.state != 'actual' else 'successful_path')
        return Result(request.attempt_id, request.intent_id, receipt['receipt_id'],
            fingerprint, None if error else payload, usage, error, disposition, rated)
