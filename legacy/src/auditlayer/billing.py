from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import json
from typing import Protocol
from typing import Any

import httpx

from .config import Settings
from .domain import Plan


class StripeWebhookError(ValueError):
    pass


class StripeCheckoutError(RuntimeError):
    pass


@dataclass(frozen=True)
class BillingUpdate:
    email: str
    plan: str
    subscription_status: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    current_period_end: str | None
    event_type: str


class CheckoutClient(Protocol):
    def create_subscription_checkout(self, email: str, plan: str, client_id: str) -> str:
        """Return the hosted Checkout URL."""


@dataclass(frozen=True)
class StripeCheckoutClient:
    settings: Settings

    def create_subscription_checkout(self, email: str, plan: str, client_id: str) -> str:
        price_id = price_id_for_plan(self.settings, plan)
        if not self.settings.stripe_secret_key:
            raise StripeCheckoutError("STRIPE_SECRET_KEY is required to create Checkout sessions")
        if not price_id:
            raise StripeCheckoutError(f"Stripe price id is not configured for {plan}")
        data = {
            "mode": "subscription",
            "customer_email": email,
            "success_url": self.settings.stripe_success_url,
            "cancel_url": self.settings.stripe_cancel_url,
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": "1",
            "metadata[auditlayer_plan]": plan,
            "metadata[client_id]": client_id,
            "subscription_data[metadata][auditlayer_plan]": plan,
            "subscription_data[metadata][client_id]": client_id,
            "subscription_data[metadata][email]": email,
        }
        response = httpx.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=data,
            auth=(self.settings.stripe_secret_key, ""),
            timeout=30,
        )
        if response.status_code >= 400:
            raise StripeCheckoutError(f"Stripe Checkout failed: {response.text[:300]}")
        payload = response.json()
        checkout_url = payload.get("url")
        if not checkout_url:
            raise StripeCheckoutError("Stripe Checkout response did not include a url")
        return checkout_url


def checkout_client_from_settings(settings: Settings) -> CheckoutClient:
    return StripeCheckoutClient(settings)


def price_id_for_plan(settings: Settings, plan: str) -> str | None:
    if plan == Plan.STARTER.value:
        return settings.stripe_starter_price_id
    if plan == Plan.PRO.value:
        return settings.stripe_pro_price_id
    return None


def verify_stripe_signature(payload: bytes, signature_header: str, secret: str, tolerance_seconds: int = 300) -> None:
    parts: dict[str, list[str]] = {}
    for item in signature_header.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        parts.setdefault(key, []).append(value)
    timestamp_values = parts.get("t", [])
    signatures = parts.get("v1", [])
    if not timestamp_values or not signatures:
        raise StripeWebhookError("Stripe signature header is missing timestamp or v1 signature")
    timestamp = int(timestamp_values[0])
    now = int(datetime.now(timezone.utc).timestamp())
    if abs(now - timestamp) > tolerance_seconds:
        raise StripeWebhookError("Stripe webhook timestamp is outside tolerance")
    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, signature) for signature in signatures):
        raise StripeWebhookError("Stripe webhook signature mismatch")


def parse_stripe_event(payload: bytes) -> dict[str, Any]:
    try:
        event = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise StripeWebhookError("Stripe webhook payload is not valid JSON") from exc
    if not isinstance(event, dict) or "type" not in event or "data" not in event:
        raise StripeWebhookError("Stripe webhook payload is missing required event fields")
    return event


def billing_update_from_event(event: dict[str, Any]) -> BillingUpdate | None:
    event_type = event["type"]
    obj = event.get("data", {}).get("object", {})
    if event_type == "checkout.session.completed":
        email = obj.get("customer_email") or obj.get("customer_details", {}).get("email")
        if not email:
            raise StripeWebhookError("Checkout session did not include customer email")
        return BillingUpdate(
            email=email.lower(),
            plan=infer_plan(obj),
            subscription_status="active",
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("subscription"),
            current_period_end=None,
            event_type=event_type,
        )
    if event_type in {"customer.subscription.created", "customer.subscription.updated"}:
        email = obj.get("customer_email") or obj.get("metadata", {}).get("email")
        if not email:
            return None
        return BillingUpdate(
            email=email.lower(),
            plan=infer_plan(obj),
            subscription_status=obj.get("status", "active"),
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("id"),
            current_period_end=timestamp_to_iso(obj.get("current_period_end")),
            event_type=event_type,
        )
    if event_type == "customer.subscription.deleted":
        email = obj.get("customer_email") or obj.get("metadata", {}).get("email")
        if not email:
            return None
        return BillingUpdate(
            email=email.lower(),
            plan=Plan.FREE.value,
            subscription_status="canceled",
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("id"),
            current_period_end=timestamp_to_iso(obj.get("current_period_end")),
            event_type=event_type,
        )
    if event_type == "invoice.payment_failed":
        email = obj.get("customer_email") or obj.get("customer_details", {}).get("email")
        if not email:
            return None
        return BillingUpdate(
            email=email.lower(),
            plan=infer_plan(obj),
            subscription_status="past_due",
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("subscription"),
            current_period_end=None,
            event_type=event_type,
        )
    return None


def infer_plan(obj: dict[str, Any]) -> str:
    metadata = obj.get("metadata") or {}
    plan = (metadata.get("auditlayer_plan") or metadata.get("plan") or "").lower()
    if plan in Plan._value2member_map_:
        return plan
    lookup = json.dumps(obj).lower()
    if "enterprise" in lookup:
        return Plan.ENTERPRISE.value
    if "pro" in lookup:
        return Plan.PRO.value
    if "starter" in lookup:
        return Plan.STARTER.value
    return Plan.STARTER.value


def timestamp_to_iso(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError):
        return None
