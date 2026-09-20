"""Ordinary-queue commercial pins and settlement, never a second executor/wallet."""
from dataclasses import replace
from decimal import Decimal, ROUND_CEILING

from .openrouter import BASE_URL, MODEL


def pinned_settings(settings, app, pin):
    if (settings.hermes_provider, settings.hermes_model, settings.hermes_mode, settings.generator) != (
            'openrouter', MODEL, 'inprocess', 'hermes'):
        raise RuntimeError('commercial_runtime_mismatch')
    if (pin.get('provider'), pin.get('model'), pin.get('data_route')) != ('openrouter', MODEL, BASE_URL):
        raise RuntimeError('commercial_runtime_mismatch')
    for key in ('max_input_tokens', 'max_output_tokens', 'max_calls',
                'input_microusd_per_mtok', 'output_microusd_per_mtok',
                'upstream_microusd', 'retail_microusd'):
        if type(pin.get(key)) is not int or pin[key] <= 0:
            raise RuntimeError('invalid_commercial_bound')
    if (not pin.get('rate_version') or type(pin.get('research_microusd')) is not int
            or pin['research_microusd'] < 0 or pin['max_calls'] > 2):
        raise RuntimeError('invalid_commercial_bound')
    # Paid research tools do not expose enforceable prices/receipts. Commercial
    # work uses the existing bounded free public index + connected/cache/brief
    # evidence, never an unpriced paid search. Reserve but do not spend or bill
    # the quote's research allowance. Legacy managed research is unchanged.
    inference_budget = (pin['upstream_microusd'] - pin['research_microusd']) / 1_000_000
    if inference_budget <= 0:
        raise RuntimeError('invalid_commercial_budget')
    return replace(settings,
        price_in_per_mtok=pin['input_microusd_per_mtok'] / 1_000_000,
        price_out_per_mtok=pin['output_microusd_per_mtok'] / 1_000_000,
        max_tokens=min(settings.max_tokens, pin['max_output_tokens']),
        max_input_tokens=min(32000, pin['max_input_tokens']),
        max_inference_calls=pin['max_calls'], commercial_execution=True,
        data_api_allowance_usd=0.0,
        token_cap=min(settings.token_cap, app.token_cap,
                      (pin['max_input_tokens'] + pin['max_output_tokens']) * pin['max_calls']),
        cost_cap_usd=min(settings.cost_cap_usd, app.cost_cap_usd, inference_budget))


def _ceil(value):
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def terminal_payload(audit_id, worker_id, pin, summary, durable_calls):
    """Only validated successful-path tokens bill; USD estimates are not actuals."""
    success = summary is not None and summary.status == 'ready'
    calls = summary.stage_timings.get('_inference', []) if summary else []
    debit = 0
    if success:
        for call in calls:
            if (call.get('status') == 'completed'
                    and all(type(call.get(k)) is int and call[k] >= 0 for k in ('tokens_in', 'tokens_out'))):
                debit += _ceil((Decimal(call['tokens_in']) * pin['input_microusd_per_mtok']
                               + Decimal(call['tokens_out']) * pin['output_microusd_per_mtok'])
                              * 3 / 1_000_000)
    # The parent recorder sees reserved receipts even if persistence or the child
    # fails. Missing provider cost cannot become a measured zero. Paid research
    # is disabled for this path, so an empty list proves no upstream dispatch.
    actual = 0
    for call in durable_calls:
        if call.get('cost_source') != 'provider_actual' or call.get('cost_usd') is None:
            actual = None
            break
        actual += _ceil(Decimal(str(call['cost_usd'])) * 1_000_000)
    return dict(audit_id=audit_id, worker_id=worker_id,
                outcome='success' if success else 'failure',
                customer_debit_microusd=debit, actual_upstream_microusd=actual,
                receipt_id='ordinary:' + str(pin['reservation_id']))
