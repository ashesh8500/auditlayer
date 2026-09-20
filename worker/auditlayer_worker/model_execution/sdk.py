"""Adapter over the existing OpenAI Python SDK, not a second HTTP provider client.

No automatic client construction or credential discovery. Deployment must supply
an isolated PRODUCT-owned SDK client, model-qualified tokenizer (including message
overhead) and operator qualification receipt ID. This is trusted composition, not
an API accepting customer qualification strings. Neither candidate is qualified
by this change. DeepSeek alias remains non-dispatchable until version pin support.
"""
import httpx
from typing import Any
from .catalog import resolve


def wire_parameters(request):
    params: dict[str, Any] = dict(model=request.model.model, messages=request.messages, n=1,
                  stream=False, tool_choice='none', response_format={'type': 'json_object'})
    if request.model.provider == 'deepseek':
        params.update(max_tokens=request.max_output,
                      extra_body={'thinking': {'type': 'disabled'}})
    elif request.model.provider == 'openai':
        params.update(max_completion_tokens=request.max_output, reasoning_effort='none',
                      service_tier='default', store=False)
    else:
        raise ValueError('unsupported provider')
    return params


class SDKBoundary:
    def __init__(self, product_client, model, count_input, *, qualification_id=None):
        if not qualification_id:
            raise ValueError('model unavailable: product qualification required')
        if resolve(model.provider, model.model, model.data_route) != model:
            raise ValueError('invalid model pin')
        if str(product_client.base_url).rstrip('/') != model.data_route:
            raise ValueError('SDK data route mismatch')
        if model.provider == 'deepseek':
            raise ValueError('model unavailable: immutable DeepSeek dispatch unverified')
        self.client = product_client
        self.model = model
        self.count_input = count_input
        self.qualification_id = qualification_id

    def complete(self, request, model):
        if model != self.model or request.model != self.model:
            raise ValueError('SDK model pin mismatch')
        if str(self.client.base_url).rstrip('/') != model.data_route:
            raise ValueError('SDK data route mismatch')
        # Public SDK interface. No retries, redirects, proxy/environment transport
        # inheritance, SDK default output ceiling, tools or streaming ambiguity.
        with httpx.Client(trust_env=False, follow_redirects=False,
                          timeout=request.timeout_seconds) as transport:
            client = self.client.with_options(max_retries=0,
                timeout=request.timeout_seconds, http_client=transport)
            return client.chat.completions.create(**wire_parameters(request)).model_dump()
