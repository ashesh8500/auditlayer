# Commercial provider qualification — 2026-09-23

## Verdict

**Conditional provider-to-credit qualification passed. Full hosted-checkout-to-credit and real webhook delivery are NOT qualified.** This is future paid-readiness evidence, not a paid-launch approval or a blocker for the separately gated nonpaid deployment. Keep production paid checkout disabled. Stripe setup remains deferred to the user's laptop.

The new `web/scripts/commercial-provider-qualification.cjs` ran against actual Stripe **TEST** API objects in account `acct_1J3tIuEoGcKPcVcd` (Auditlayermedia), pinned API `2026-05-27.dahlia`, and an owned disposable PostgreSQL container with **all 82 canonical migrations** applied. It bundled the actual commercial server action and actual `src/app/api/webhooks/stripe/route.ts` POST handler with esbuild. Auth and database transport point exclusively at disposable SQL; Stripe calls use the real SDK and network, not recording adapters or synthetic provider responses.

No production runtime defect was reproduced against the pinned API; **no production source was changed**.

## What passed

For both Brand and Studio:

- Actual commercial server action created an actual open hosted Stripe Checkout session at the approved price.
- Repeating the same plan reused the exact session. A conflicting plan returned `/commercial?payment=unconfirmed`; listing the customer's sessions showed exactly one, not a second admitted contract.
- The owned session was expired using Stripe's API, retrieved as `expired`, then passed as a real object through the signed POST route; disposable SQL reservation became `expired`.
- A new test subscription was created with SDK test payment method `pm_card_visa`. Stripe returned an active subscription and paid invoice; the handler retrieved actual invoice, subscription, and PaymentIntent objects itself.
- Invoice arrival before local enrollment authority returned **503**, with **zero credit lots**.
- With the explicit local admission precondition described below, invoice processing returned **200 / applied**: Brand **5,000 credits in one lot**, Studio **15,000 credits in one lot**.
- Exact event replay and another locally enveloped delivery of the same actual invoice still produced exactly one lot.
- Actual Stripe cancellation was retrieved and delivered through the signed handler: **200**, SQL profile status `canceled`, plan `free`.
- A post-cancellation replay of already-confirmed money did not restore active status or mint another lot. The final run returned the same existing lot with **200**; an earlier run also exercised **503**. Both are acceptable only with the asserted canceled profile and unchanged single-lot count.

## Critical evidence boundaries

**Hosted browser completion was not exercised.** No `checkout.session.completed` provider object or event was invented. Open hosted sessions were genuinely expired. The subscription/payment leg used the allowed direct test-subscription fallback.

To test credit reconciliation after that fallback, the harness explicitly seeded only the disposable database's enrollment `state='completed'` and profile `stripe_subscription_id`, using the actual subscription ID. It did not seed credit lots, payment commands, invoice facts, or event receipts. Actual invoice reconciliation populated those via the real production RPCs and payment verification. This isolates the already-admitted subscription/payment path; it does **not** prove the browser-to-admission link.

**Signatures and event envelopes are local test inputs.** The SDK generates a testing signature over a locally constructed event envelope containing an unmodified real Stripe object. `evt_qa_*` identifiers are local, not provider event IDs. This proves route signature validation and handler execution, not Stripe delivery, endpoint configuration, event API-version compatibility, or retry transport.

## Final run evidence

Run UUID: `252b3efc-8e62-4fc2-b392-98d2ae09877c`.

Full local receipt: `/home/asheshkaji/.hermes/cache/scratch/alm-provider-qualification-20260923-final.json` (scratch retention is temporary; durable identifiers and outcomes are below).

| Fact | Brand | Studio |
|---|---|---|
| Approved price | `price_1UIrktEoGcKPcVcdBsLCUpMs` | `price_1UIrkuEoGcKPcVcdxTNhdFKP` |
| Test amount paid, cents | 19900 | 49900 |
| Customer | `cus_VJUru5aRH2arv6` | `cus_VJUryC15Iy1wxe` |
| Subscription | `sub_1UIrreEoGcKPcVcdwUg7FEBP` | `sub_1UIrrwEoGcKPcVcdHWYaIyzO` |
| Invoice | `in_1UIrreEoGcKPcVcdiKWjf9UG` | `in_1UIrrxEoGcKPcVcdru74L8SY` |
| PaymentIntent | `pi_3UIrreEoGcKPcVcd1iH6xkmS` | `pi_3UIrrxEoGcKPcVcd1F7kCIXJ` |
| Disposable SQL lot | `1e23d594-91a0-4cfd-be7c-c3b29d542da9` | `76b14e7d-7e14-44f4-bedc-22f61776350c` |
| Credits / lots after replay | 5000 / 1 | 15000 / 1 |
| QA owner | `023c11a8-e040-4e53-a47d-75a6c289f071` | `1ad48a72-a603-4d7d-861e-bb4ea4acc4ac` |

Actual expired hosted sessions:

- Brand: `cs_test_a1GG1WjCYE9Bv6saVrfZLPwkOchtnH6joPygLH5E3MGk59aPObxPpAZ1gk`
- Studio: `cs_test_a1enj05BMozp3evPBiHM8vvFdHmjB0vBhFjEeNelwtphbv4x3L7JQbSsSj`

## Production safety and cleanup

- A read-only production REST query verified each fresh QA owner UUID was absent **before any provider creation**. The final harness also reverified absence after cleanup. No production database writes were made by this harness.
- Existing test webhook subscriptions can automatically receive events from test-object creation. This is why every subscription carries the verified-absent QA profile UUID. The harness did not intentionally send requests/events to any deployed webhook URL or alter endpoint settings.
- Only the privately loaded Stripe CLI TEST key was used. Account, test-key prefix, price identity, amounts, recurrence, currency, and provider object `livemode=false` were checked. No live charge or live object was created.
- Final-run sessions were read back `expired`; subscriptions were read back `canceled`; customers were read back `deleted=true`. The owned database container was removed and its absence verified.
- Across all four development/qualification runs: **6 customers deleted, 5 subscriptions canceled, 5 hosted sessions expired**, with cleanup readbacks and all four owned database removals verified. The first run stopped on a harness-only profile-read role permission issue; the second stopped on an overly strict expectation that an already-confirmed canceled invoice must always return 503. Neither was treated as a production defect or falsely reported as a complete pass.
- Test invoice/payment records remain as Stripe's historical test records after cancellation/customer deletion; they are not live obligations. Approved shared test prices were preserved.

## Actionable future paid-setup gap

A separate read-only API lookup verified existing TEST endpoint `we_1TfmlFEoGcKPcVcdI1pV99Ih` is enabled and pinned to **`2020-08-27`**, not the SDK's `2026-05-27.dahlia`. Its exact subscribed event list is:

```
checkout.session.completed
customer.updated
customer.subscription.deleted
customer.subscription.created
customer.deleted
customer.created
customer.subscription.updated
```

It lacks **`invoice.paid`** and **`checkout.session.expired`**. Therefore it cannot qualify the new paid credit-grant/expiry lifecycle as configured. The parent also identified this test endpoint as targeting production. It was **not modified**. Before later enabling paid checkout, the owner must configure an appropriate version-compatible endpoint/event set and qualify actual delivery plus a completed hosted checkout in the intended environment. This is a configuration qualification gap, not a reason to weaken invoice, authority, ordering, or receipt fences.

## Reproduction and regression evidence

From the integration worktree, with its own installed dependencies and Docker available:

```sh
ALM_QA_PRODUCTION_ENV=/path/to/production-read-credentials.env \
ALM_QA_RECEIPT="$TMPDIR/alm-provider-qualification.json" \
node web/scripts/commercial-provider-qualification.cjs
```

The environment file supplies only the hosted Supabase URL/service credential for exact-UUID **GET** absence checks. It is never loaded into application environment variables. Stripe credentials come privately from `~/.config/stripe/config.toml` at `default.api_key`; the script rejects live keys and any unexpected account. `TMPDIR` must be an absolute owned scratch directory. Running this command deliberately creates and then cleans up TEST-mode provider objects; it is not an offline unit test.

Executed successfully:

- Final real-provider qualification: exit 0; all conditional gates and cleanup passed.
- `web/node_modules/.bin/eslint scripts/commercial-provider-qualification.cjs`: clean (run from `web`).
- Worktree Vitest 3.2.4 over `commercial-webhook`, `commercial-checkout`, `actions/commercial-billing`, and `workspace/payments`: **4 files, 16 tests passed**.
- `python supabase/tests/commercial_review_fixes_test.py`: passed full-chain SQL ordering, earlier/delayed invoices, invalid amounts/customer/signature, renewal, cancellation, retired subscription fences, owner-wide admission races, signed legacy lifecycle, and concurrent actual Brand/Starter actions. That regression suite uses mocked provider transport and is **not** counted as real-provider qualification.
- No production build was initiated by this subagent; parent owns the shared build/deployment gate. No push, deploy, schema edit, worker edit, or paid-enabled configuration change was performed here.
