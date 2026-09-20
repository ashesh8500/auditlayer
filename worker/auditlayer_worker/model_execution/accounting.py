"""Pure reconciliation projection; NEVER authorizes or writes a charge.

Input is the complete attempt set for one intent. SQL must supply the full set,
reconcile unknown liability, use the pinned tariff and settle idempotently.
Rated upstream values are conservative estimates, not provider invoices.
"""


def summarize(results):
    seen, receipts, intents = set(), set(), set()
    successful = []
    absorbed = 0
    known = 0
    pending = False
    for result in results:
        if result.attempt_id in seen or result.admission_receipt_id in receipts:
            raise ValueError('duplicate attempt or admission receipt')
        seen.add(result.attempt_id)
        receipts.add(result.admission_receipt_id)
        intents.add(result.intent_id)
        if result.disposition == 'successful_path':
            if (result.usage.state != 'actual' or result.rated_upstream_microusd is None
                    or result.error is not None or result.analysis is None):
                raise ValueError('successful path requires validated actual usage')
            successful.append(result)
        if result.rated_upstream_microusd is None:
            pending = True
        else:
            known += result.rated_upstream_microusd
            if result.disposition == 'absorbed_failure':
                absorbed += result.rated_upstream_microusd
        pending |= result.disposition == 'pending_reconciliation'
    if len(intents) > 1:
        raise ValueError('mixed intents')
    if len(successful) > 1:
        raise ValueError('multiple successful paths; manual reconciliation required')
    charge = successful[0].rated_upstream_microusd * 3 if successful else 0
    return dict(rated_upstream_microusd=None if pending else known,
                known_rated_upstream_microusd=known,
                customer_microusd=charge,
                absorbed_microusd=absorbed, pending_reconciliation=pending)
