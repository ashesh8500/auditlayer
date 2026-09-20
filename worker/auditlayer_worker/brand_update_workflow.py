"""Bounded saved brand-review control plane; never a paid executor.

SQL owns occurrences, current grants, queue admission and outbox consumption.
Missing queue/model/mail qualification fails closed. No SDK discovery or retries.
"""
from __future__ import annotations

from typing import Protocol
from urllib.parse import urlsplit
from uuid import UUID


class MailBoundary(Protocol):
    """ALM-scoped injected adapter, no personal/operator credentials.

    Implementations must disable SDK retries, bound the call, and return a
    durable provider acceptance ID. On timeout they must raise, not say unsent.
    """
    def send(self, *, recipient: str, url: str, idempotency_key: str) -> str: ...


def scheduler_tick(gateway, *, enabled: bool = False) -> int:
    if not enabled:
        return 0
    admitted = gateway.client.rpc('brand_workflow_tick', {'p': {'limit': 10}}).execute().data
    gateway.client.rpc('brand_workflow_collect_reviews', {'p': {'limit': 10}}).execute()
    return int(admitted or 0)


def deliver_one(gateway, delivery_id: str, *, mail: MailBoundary | None, origin: str) -> str:
    """One send, linearized by SQL claim immediately before the mail boundary.

    A revoked claim throws before sending. Lost claim or result responses are
    not retried; SQL remains dispatching/reconciling for provider reconciliation.
    No attachment, public object URL, provider report contents or recipient list.
    """
    if mail is None:
        return 'mail_unavailable'
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('A trusted HTTPS application origin is required')
    claim = gateway.client.rpc('brand_workflow_send_claim', {'p': {'delivery_id': delivery_id}}).execute().data
    artifact_link = origin.rstrip('/') + '/workflow-artifacts/' + str(UUID(claim['delivery_id']))
    status, receipt = 'reconciling', None
    try:
        receipt = mail.send(recipient=claim['recipient_email'], url=artifact_link, idempotency_key=claim['idempotency_key'])
        if not isinstance(receipt, str) or not receipt.strip():
            receipt = None
        else:
            status = 'sent'
    except Exception:
        # A provider failure is not proof that delivery did not happen.
        receipt = None
    gateway.client.rpc('brand_workflow_send_result', {'p': dict(delivery_id=delivery_id, status=status, provider_receipt=receipt)}).execute()
    return status
