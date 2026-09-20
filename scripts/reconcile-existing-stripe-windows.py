#!/usr/bin/env python3
"""Review/apply missing Stripe starts for existing linked Starter/Pro subscribers.

No calls occur unless explicitly run. Default is read-only; --apply additionally
calls a narrowly guarded SQL RPC and reads each target back. Never creates a
subscription, grants a plan, guesses an anchor, or rewrites an existing start.
Run after stage-1 migration/webhook, before the stage-2 allowance gate.
"""
import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def request(url, headers, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, body, {**headers, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Explicitly persist verified missing starts")
    args = parser.parse_args()
    root = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db_headers = {"apikey": key, "Authorization": "Bearer " + key}
    stripe_headers = {"Authorization": "Bearer " + os.environ["STRIPE_SECRET_KEY"]}
    mapped = {os.environ["STRIPE_PRICE_STARTER"]: "starter", os.environ["STRIPE_PRICE_PRO"]: "pro"}
    select = "id,plan,stripe_subscription_id,stripe_customer_id,subscription_status,current_period_start,current_period_end"
    # Collect first: applying must not shift offset pagination over missing-start rows.
    profiles = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({"select": select, "stripe_subscription_id": "not.is.null", "stripe_customer_id": "not.is.null", "plan": "in.(starter,pro)", "subscription_status": "in.(active,trialing)", "current_period_start": "is.null", "order": "id", "limit": 200, "offset": offset})
        page = request(root + "/profiles?" + query, db_headers)
        profiles.extend(page)
        if len(page) < 200:
            break
        offset += len(page)
    failures = 0
    for profile in profiles:
        sub_id = profile["stripe_subscription_id"]
        subscription = request("https://api.stripe.com/v1/subscriptions/" + urllib.parse.quote(sub_id, safe=""), stripe_headers)
        items = subscription.get("items", {}).get("data", [])
        # Current product is exactly one mapped monthly item; ambiguity needs review.
        item = items[0] if len(items) == 1 else {}
        price = item.get("price", {})
        # Select the provider's pair as a unit. Partial/null item bounds must
        # fail validation, never borrow the other boundary from legacy data.
        window = item if "current_period_start" in item or "current_period_end" in item else subscription
        start = window.get("current_period_start")
        end = window.get("current_period_end")
        recurring = price.get("recurring", {})
        valid = (subscription.get("id") == sub_id and subscription.get("customer") == profile["stripe_customer_id"]
                 and subscription.get("status") == profile["subscription_status"]
                 and mapped.get(price.get("id")) == profile["plan"]
                 and recurring.get("interval") == "month" and recurring.get("interval_count") == 1
                 and isinstance(start, int) and isinstance(end, int) and 0 < start < end)
        if valid:
            valid = bool(profile["current_period_end"]) and datetime.fromisoformat(profile["current_period_end"].replace("Z", "+00:00")).timestamp() == end
        if not valid:
            print(json.dumps({"profile_id": profile["id"], "outcome": "requires_normal_stripe_reconciliation"}))
            failures += 1
            continue
        outcome = "verified_read_only"
        if args.apply:
            applied = request(root + "/rpc/backfill_stripe_period_start", db_headers, {
                "p_user_id": profile["id"], "p_subscription_id": sub_id,
                "p_customer_id": profile["stripe_customer_id"], "p_start_epoch": start, "p_end_epoch": end,
            })
            rows = request(root + "/profiles?" + urllib.parse.urlencode({"select": select, "id": "eq." + profile["id"]}), db_headers)
            readback = rows[0] if len(rows) == 1 else {}
            stamp = readback.get("current_period_start")
            verified = applied is True and stamp and datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() == start
            verified = verified and all(readback.get(k) == profile[k] for k in ("plan", "stripe_subscription_id", "stripe_customer_id", "subscription_status", "current_period_end"))
            outcome = "applied_verified" if verified else "not_applied_or_readback_conflict"
            failures += not bool(verified)
        print(json.dumps({"profile_id": profile["id"], "start": datetime.fromtimestamp(start, timezone.utc).isoformat(), "end": datetime.fromtimestamp(end, timezone.utc).isoformat(), "outcome": outcome}))
    print(json.dumps({"existing_subscribers_checked": len(profiles), "requires_review": failures, "apply": args.apply}))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
